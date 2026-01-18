import Link from "next/link";

export default function Nav() {
  return (
    <nav className="border-b border-gray-800 mb-8">
      <div className="max-w-6xl mx-auto px-8 py-4 flex gap-6">
        <Link href="/dashboard" className="text-sm hover:text-gray-400 transition-colors">
          Dashboard
        </Link>
        <Link href="/settings" className="text-sm hover:text-gray-400 transition-colors">
          Settings
        </Link>
      </div>
    </nav>
  );
}
