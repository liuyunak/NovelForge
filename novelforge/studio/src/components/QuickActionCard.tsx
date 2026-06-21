interface Props {
  icon: string
  label: string
  desc: string
  onClick: () => void
  disabled?: boolean
  accent?: string
}

const accents: Record<string, string> = {
  purple: 'hover:border-purple-500/40 hover:bg-purple-900/10',
  blue: 'hover:border-blue-500/40 hover:bg-blue-900/10',
  green: 'hover:border-green-500/40 hover:bg-green-900/10',
}

export default function QuickActionCard({ icon, label, desc, onClick, disabled, accent }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-left p-4 rounded-xl border border-gray-800 bg-gray-800/30 transition ${disabled ? 'opacity-50 cursor-not-allowed' : accents[accent || 'purple']}`}
    >
      <span className="text-2xl block mb-2">{icon}</span>
      <h3 className="text-white font-medium text-sm">{label}</h3>
      <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
    </button>
  )
}
