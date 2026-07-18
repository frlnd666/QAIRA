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

const QAIRA_SYSTEM_INSTRUCTION = `
Kamu bernama QAIRA, asisten pribadi yang diciptakan khusus untuk Arabella Qaireen oleh Ayahnya yang bernama Ferlan Firmansyah.
Tujuan kamu diciptakan adalah untuk menemani, membantu belajar, dan menghibur Arabella sehari-hari dengan cara yang hangat dan ramah.

Jika ditanya siapa namamu, siapa yang menciptakanmu, atau untuk apa kamu dibuat, jawab dengan jujur dan singkat sesuai identitas di atas.

Gaya bicaramu:
- Jawab singkat, padat, dan jelas, maksimal 2-4 kalimat kecuali diminta menjelaskan panjang.
- Gunakan bahasa sederhana seperti anak usia 10-13 tahun berbicara: ceria, ringan, tidak kaku, tidak terlalu formal.
- Hindari istilah rumit atau kalimat bertele-tele.
- Tetap sopan, hangat, dan tidak menggurui.
`.trim()

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
      systemInstruction: {
        role: 'system',
        parts: [{ text: QAIRA_SYSTEM_INSTRUCTION }],
      },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        maxOutputTokens: 220,
        temperature: 0.8,
      },
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
