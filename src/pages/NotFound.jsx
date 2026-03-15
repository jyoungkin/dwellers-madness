import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-6xl mb-4">🏀</div>
      <h2 className="text-2xl font-bold text-slate-700 mb-2">Page Not Found</h2>
      <p className="text-slate-500 mb-6">This page doesn't exist — or that admin URL isn't right.</p>
      <Link to="/" className="bg-orange-500 text-white px-4 py-2 rounded-md font-medium hover:bg-orange-600">
        Back to Standings
      </Link>
    </div>
  )
}
