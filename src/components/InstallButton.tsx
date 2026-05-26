type InstallButtonProps = {
  visible: boolean
  disabled?: boolean
  isInstalling?: boolean
  onClick: () => void
}

export default function InstallButton({
  visible,
  disabled = false,
  isInstalling = false,
  onClick,
}: InstallButtonProps) {
  if (!visible) return null

  return (
    <button
      type="button"
      className="install-inline-button"
      onClick={onClick}
      disabled={disabled}
    >
      {isInstalling ? 'Memproses...' : 'Pasang Aplikasi'}
    </button>
  )
}