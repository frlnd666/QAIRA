  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string
const GEMINI_MODEL = 'gemini-3.1-flash-lite'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

interface InlinePart {
  inlineData: {
    mimeType: string
    data: string
  }
}

interface TextPart {
  text: string
}

type ContentPart = TextPart | InlinePart

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function askGemini(
  prompt: string,
  attachments: { mimeType: string; base64: string }[] = []
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('API key Gemini belum diatur.')
  }

  const parts: ContentPart[] = [{ text: prompt }]

  for (const attachment of attachments) {
    parts.push({
      inlineData: {
        mimeType: attachment.mimeType,
        data: attachment.base64,
      },
    })
  }

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Gemini API error: ${response.status} ${errorBody}`)
  }

  const data = await response.json()
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) {
    throw new Error('Gemini tidak mengembalikan jawaban.')
  }

  return text.trim()
}

export const askPerplexity = askGemini
