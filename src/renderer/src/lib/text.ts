export function splitSentences(input: string): string[] {
  const text = input.replace(/\r\n?/g, '\n').trim()
  if (!text) return []
  const marked = text
    .replace(/([。！？!?；;…]+[”’"'）)】》」』]*)/g, '$1\u0000')
    .replace(/([.!?;]+)(\s+|$)/g, '$1\u0000')
    .replace(/\n+/g, '\u0000')
  return marked
    .split('\u0000')
    .map((s) => s.replace(/^[\s、，,]+/, '').trim())
    .filter(Boolean)
}

export function visualQueryFromSentence(text: string): string {
  return text
    .replace(/[。！？!?；;…，,、：:"“”'‘’（）()《》【】「」『』\s]+/g, ' ')
    .trim()
    .slice(0, 48)
}