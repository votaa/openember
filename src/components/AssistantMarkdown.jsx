import React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const components={
  img:({alt})=><span>[Image: {alt || 'not loaded'}]</span>,
  a:({href,children})=>/^https?:\/\//i.test(href||'')?<a href={href} target="_blank" rel="noopener noreferrer">{children}</a>:<span>{children}</span>,
  table:({children})=><div className="answer-table" tabIndex={0} role="region" aria-label="Answer table"><table>{children}</table></div>,
}
export default function AssistantMarkdown({children}) {
  return <div className="assistant-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={components}>{children}</Markdown></div>
}
