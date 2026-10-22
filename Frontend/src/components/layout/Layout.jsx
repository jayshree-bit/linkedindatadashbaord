
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';

import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout() {
  const { user } = useSelector((state) => state.auth);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMini, setSidebarMini] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar
        user={user}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        mini={sidebarMini}
        onToggleMini={() => setSidebarMini((mini) => !mini)}
      />

      <div
        className={`min-h-screen transition-all duration-300 ${
          sidebarMini ? 'lg:pl-20' : 'lg:pl-60'
        }`}
      >
        <Header
          user={user}
          onMenuClick={() => setSidebarOpen((open) => !open)}
        />

        <main className="min-h-[calc(100vh-5rem)] bg-slate-50 p-4 transition-colors duration-300 dark:bg-slate-950 sm:p-5 lg:p-7">
          <div className="mx-auto w-full max-w-none">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
