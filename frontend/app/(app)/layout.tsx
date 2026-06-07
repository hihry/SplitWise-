export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex bg-gray-50 min-h-screen">
      <aside className="w-64 bg-white border-r">Sidebar</aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
