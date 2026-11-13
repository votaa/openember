// Application limits for the hosted cloud path. Bytes are UTF-8 bytes, not
// token counts. Keep Python parity checked by cloud-upload conformance tests.
export const UPLOAD_LIMITS = Object.freeze({
  extensions: ['txt','csv','json','geojson','md'],
  maxFileBytes: 65536,
  maxTotalBytes: 131072,
  maxFiles: 8,
  maxInputBytes: 98304,
  maxMessages: 11,
  maxRequestBytes: 1048576,
  outputReserveTokens: 8192,
})
export const UPLOAD_GUIDANCE = 'UTF-8 .txt, .csv, .json, .geojson or .md. Up to 64 KiB per file, 128 KiB total, 8 files. Accepted documents are included in full. The combined prompt (documents, KB, live data and recent chat) must fit 96 KiB of UTF-8 text. If it does not fit, nothing is sent; remove documents or unnecessary sources, split a document, or start a new chat.'
export class UploadError extends Error {
  constructor(message,code='upload_limit',status=413){super(message);this.name='UploadError';this.code=code;this.status=status}
}
export const utf8Bytes = text => new TextEncoder().encode(text).length
export function validateFileMetadata(name,size){
  if(typeof name!=='string'||!UPLOAD_LIMITS.extensions.includes(name.split('.').pop().toLowerCase()))throw new UploadError('Unsupported file type. Use UTF-8 .txt, .csv, .json, .geojson or .md.', 'upload_type',400)
  if(!Number.isSafeInteger(size)||size<=0)throw new UploadError(`${name}: the file is empty or its size is invalid.`, 'upload_empty',400)
  if(size>UPLOAD_LIMITS.maxFileBytes)throw new UploadError(`${name}: exceeds 64 KiB per file. Split the document before uploading; no excerpt was added.`)
}
export function validateUploads(files){
  if(!Array.isArray(files))throw new UploadError('Invalid document list.','upload_invalid',400)
  if(files.length>UPLOAD_LIMITS.maxFiles)throw new UploadError('At most 8 documents can be attached. Remove a document before adding another.')
  let total=0;const names=new Set()
  for(const file of files){
    if(!file||typeof file.content!=='string')throw new UploadError('Document text is invalid. Remove and upload the document again.','upload_invalid',400)
    const size=utf8Bytes(file.content)
    validateFileMetadata(file.name,size)
    if(file.content.includes('\0'))throw new UploadError(`${file.name}: contains binary data. Upload a UTF-8 text export instead.`,'upload_encoding',400)
    if(names.has(file.name))throw new UploadError(`${file.name}: already attached. Remove it before uploading a replacement.`,'upload_duplicate',400)
    names.add(file.name);total+=size
  }
  if(total>UPLOAD_LIMITS.maxTotalBytes)throw new UploadError('Attached documents exceed 128 KiB total. Remove or split documents; no excerpt was added.')
  return total
}
export function decodeUpload(name,buffer){
  validateFileMetadata(name,buffer.byteLength)
  let content
  try{content=new TextDecoder('utf-8',{fatal:true}).decode(buffer)}catch{throw new UploadError(`${name}: is not valid UTF-8 text. Export it as UTF-8 and upload again.`,'upload_encoding',400)}
  const file={name,content};validateUploads([file]);return file
}
export function uploadedDocumentContext(files){
  validateUploads(files)
  if(!files.length)return ''
  return '--- UPLOADED DOCUMENTS · COMPLETE TEXT ---\n'
    + files.map(file=>`[File: ${file.name}; coverage: complete; UTF-8 bytes: ${utf8Bytes(file.content)}]\n${file.content}\n\n`).join('')
}
export function validateCloudMessages(messages){
  if(!Array.isArray(messages)||!messages.length||messages.length>UPLOAD_LIMITS.maxMessages)throw new UploadError('Invalid chat history. Start a new chat and try again.','request_invalid',400)
  let bytes=0
  for(const message of messages){
    if(!message||!['system','user','assistant'].includes(message.role)||typeof message.content!=='string')throw new UploadError('Invalid message content.','request_invalid',400)
    bytes+=utf8Bytes(message.content)
  }
  if(bytes>UPLOAD_LIMITS.maxInputBytes)throw new UploadError(`The combined prompt is ${(bytes/1024).toFixed(1)} KiB; this cloud path supports 96 KiB of UTF-8 prompt text. Nothing was sent to the model. Remove documents or unnecessary sources, split a document, or start a new chat. No content was shortened.`,'context_limit')
  return bytes
}
