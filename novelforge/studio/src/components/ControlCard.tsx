interface Props {
  title: string
  description: string
  buttonText: string
  onAction?: () => void
  disabled?: boolean
}

export default function ControlCard({ title, description, buttonText, onAction, disabled }: Props) {
  return (
    <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-4 flex items-center justify-between">
      <div>
        <h3 className="text-white font-medium">{title}</h3>
        <p className="text-gray-500 text-xs mt-0.5">{description}</p>
      </div>
      <button
        onClick={onAction}
        disabled={disabled}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition shrink-0 ml-4 ${
          disabled ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 text-white'
        }`}
      >
        {buttonText}
      </button>
    </div>
  )
}
