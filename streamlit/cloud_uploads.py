"""Hosted cloud upload policy. JavaScript/Python behavior has conformance tests."""
UPLOAD_LIMITS = dict(extensions=['txt','csv','json','geojson','md'],maxFileBytes=65536,maxTotalBytes=131072,maxFiles=8,maxInputBytes=98304,maxMessages=11,maxRequestBytes=1048576,outputReserveTokens=8192)
UPLOAD_GUIDANCE = 'UTF-8 .txt, .csv, .json, .geojson or .md. Up to 64 KiB per file, 128 KiB total, 8 files. Accepted documents are included in full. The combined prompt (documents, KB, live data and recent chat) must fit 96 KiB of UTF-8 text. If it does not fit, nothing is sent; remove documents or unnecessary sources, split a document, or start a new chat.'

class UploadError(ValueError):
    def __init__(self,message,code='upload_limit',status=413):
        super().__init__(message);self.code=code;self.status=status

def utf8_bytes(text):
    return len(text.encode('utf-8'))

def validate_file_metadata(name,size):
    if not isinstance(name,str) or name.split('.')[-1].lower() not in UPLOAD_LIMITS['extensions']:
        raise UploadError('Unsupported file type. Use UTF-8 .txt, .csv, .json, .geojson or .md.','upload_type',400)
    if type(size) is not int or size<=0:
        raise UploadError(f'{name}: the file is empty or its size is invalid.','upload_empty',400)
    if size>UPLOAD_LIMITS['maxFileBytes']:
        raise UploadError(f'{name}: exceeds 64 KiB per file. Split the document before uploading; no excerpt was added.')

def validate_uploads(files):
    if not isinstance(files,list):raise UploadError('Invalid document list.','upload_invalid',400)
    if len(files)>UPLOAD_LIMITS['maxFiles']:raise UploadError('At most 8 documents can be attached. Remove a document before adding another.')
    total=0;names=set()
    for file in files:
        if not isinstance(file,dict) or not isinstance(file.get('content'),str):raise UploadError('Document text is invalid. Remove and upload the document again.','upload_invalid',400)
        size=utf8_bytes(file['content']);name=file.get('name')
        validate_file_metadata(name,size)
        if '\0' in file['content']:raise UploadError(f'{name}: contains binary data. Upload a UTF-8 text export instead.','upload_encoding',400)
        if name in names:raise UploadError(f'{name}: already attached. Remove it before uploading a replacement.','upload_duplicate',400)
        names.add(name);total+=size
    if total>UPLOAD_LIMITS['maxTotalBytes']:raise UploadError('Attached documents exceed 128 KiB total. Remove or split documents; no excerpt was added.')
    return total

def decode_upload(name,data):
    validate_file_metadata(name,len(data))
    try:content=data.decode('utf-8-sig')
    except UnicodeDecodeError:raise UploadError(f'{name}: is not valid UTF-8 text. Export it as UTF-8 and upload again.','upload_encoding',400)
    file=dict(name=name,content=content);validate_uploads([file]);return file

def uploaded_document_context(files):
    validate_uploads(files)
    if not files:return ''
    return '--- UPLOADED DOCUMENTS · COMPLETE TEXT ---\n'+''.join(f"[File: {file['name']}; coverage: complete; UTF-8 bytes: {utf8_bytes(file['content'])}]\n{file['content']}\n\n" for file in files)

def validate_cloud_messages(messages):
    if not isinstance(messages,list) or not messages or len(messages)>UPLOAD_LIMITS['maxMessages']:raise UploadError('Invalid chat history. Start a new chat and try again.','request_invalid',400)
    size=0
    for message in messages:
        if not isinstance(message,dict) or message.get('role') not in ('system','user','assistant') or not isinstance(message.get('content'),str):raise UploadError('Invalid message content.','request_invalid',400)
        size+=utf8_bytes(message['content'])
    if size>UPLOAD_LIMITS['maxInputBytes']:raise UploadError(f'The combined prompt is {size/1024:.1f} KiB; this cloud path supports 96 KiB of UTF-8 prompt text. Nothing was sent to the model. Remove documents or unnecessary sources, split a document, or start a new chat. No content was shortened.','context_limit')
    return size
