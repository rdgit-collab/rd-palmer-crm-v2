export default function Placeholder({ title, description, icon }) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-[#111111]">{title}</h2>
        <p className="text-gray-400 text-sm mt-0.5">{description}</p>
      </div>
      <div className="bg-white border border-[#E0E0E0] rounded-xl p-16 text-center">
        <div className="text-5xl mb-4">{icon || '🔧'}</div>
        <h3 className="font-semibold text-[#111111] mb-1">Module Coming Soon</h3>
        <p className="text-gray-400 text-sm">This module is being built and will be available shortly.</p>
      </div>
    </div>
  )
}
