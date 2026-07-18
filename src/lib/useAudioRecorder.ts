import { useCallback, useRef, useState } from 'react'

const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined

  for (const type of CANDIDATE_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }

  return undefined
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [recordError, setRecordError] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef<string>('audio/webm')

  const stopStreamTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const startRecording = useCallback(async () => {
    setRecordError('')

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setRecordError('Browser ini tidak mendukung perekaman audio.')
      return
    }

    if (typeof MediaRecorder === 'undefined') {
      setRecordError('Browser ini tidak mendukung MediaRecorder.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = pickSupportedMimeType()
      mimeTypeRef.current = mimeType ?? 'audio/webm'

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        setRecordError('Terjadi kesalahan saat merekam audio.')
        setIsRecording(false)
        stopStreamTracks()
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'NotAllowedError'
          ? 'Izin mikrofon ditolak.'
          : 'Tidak bisa mengakses mikrofon.'

      setRecordError(message)
      setIsRecording(false)
      stopStreamTracks()
    }
  }, [stopStreamTracks])

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current

      if (!recorder || recorder.state === 'inactive') {
        setIsRecording(false)
        resolve(null)
        return
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current })
        chunksRef.current = []
        stopStreamTracks()
        setIsRecording(false)
        resolve(blob.size > 0 ? blob : null)
      }

      recorder.stop()
    })
  }, [stopStreamTracks])

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current

    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.stop()
    }

    chunksRef.current = []
    stopStreamTracks()
    setIsRecording(false)
  }, [stopStreamTracks])

  return {
    isRecording,
    recordError,
    startRecording,
    stopRecording,
    cancelRecording,
  }
}
