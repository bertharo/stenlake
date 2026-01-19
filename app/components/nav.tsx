import Link from "next/link";

export default function Nav() {
  return (
    <nav className="border-b border-gray-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="flex gap-4 sm:gap-6">
          <Link href="/dashboard" className="text-sm hover:text-gray-400 transition-colors">
            Dashboard
          </Link>
          <Link href="/settings" className="text-sm hover:text-gray-400 transition-colors">
            Settings
          </Link>
        </div>
      </div>
    </nav>
  );
}
