const API_URL = 'https://api.perplexity.ai/chat/completions'
const API_KEY = import.meta.env.VITE_PERPLEXITY_API_KEY

type PerplexityMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type PerplexityChoice = {
  message?: {
    content?: string
  }
}

type PerplexityResponse = {
  choices?: PerplexityChoice[]
  error?: {
    message?: string
    type?: string
    code?: number
  }
}

function assertApiKey() {
  if (!API_KEY) {
    throw new Error('VITE_PERPLEXITY_API_KEY belum diisi di file .env')
  }
}

export async function askPerplexity(userPrompt: string) {
  assertApiKey()

  const messages: PerplexityMessage[] = [
    {
      role: 'system',
      content:
        'Kamu adalah QAIRA, Asisten pribadi arabella, kamu chatbot suara cewek kecil yang lucu dan natural. Jawab dengan bahasa Indonesia gaul yang santai, singkat, hangat, dan enak didengar. Jangan gunakan markdown, bullet, heading, emoji, simbol teknis, format kode, atau karakter aneh. Jawab maksimal 2 sampai 3 kalimat.',
    },
    {
      role: 'user',
      content: String(userPrompt || '').trim(),
    },
  ]

  const payload = {
    model: 'sonar',
    messages,
    temperature: 0.7,
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const raw = await response.text()

  if (!response.ok) {
    throw new Error(`Perplexity API ${response.status}: ${raw}`)
  }

  let data: PerplexityResponse

  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error(`Respons API bukan JSON valid: ${raw}`)
  }

  const content = data.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error(`Respons Perplexity kosong: ${raw}`)
  }

  return content
}