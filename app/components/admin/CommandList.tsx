'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FaExchangeAlt, FaUserEdit, FaUsers, FaSignOutAlt, FaFileExcel } from 'react-icons/fa';
import { useState } from 'react';

export default function CommandList() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const response = await fetch('/api/admin/logout', {
        method: 'POST',
      });

      if (response.ok) {
        router.push('/admin/login');
        router.refresh();
      } else {
        console.error('Logout failed');
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const adminCommands = [
    {
      icon: FaUsers,
      title: "Modifica squadre",
      description: "Gestisci le squadre del fantacalcio",
      href: "/admin/manage/teams",
      color: "bg-blue-100 text-blue-600"
    },
    {
      icon: FaUserEdit,
      title: "Modifica giocatori",
      description: "Aggiorna dati e statistiche giocatori",
      href: "/admin/manage/players",
      color: "bg-green-100 text-green-600"
    },
    {
      icon: FaExchangeAlt,
      title: "Visualizza scambi",
      description: "Controlla gli scambi attivi",
      href: "/admin/manage/trades",
      color: "bg-orange-100 text-orange-600"
    },
    {
      icon: FaFileExcel,
      title: "Listone",
      description: "Importa e genera",
      href: "/admin/manage/listone",
      color: "bg-orange-100 text-orange-600"
    },
  ];

  return (
    <div className="container flex mx-auto w-full items-center justify-center">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <div className="flex justify-between items-center mb-4">
            <div className="flex-1"></div>
            <div className="flex-1 text-center">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Pannello Admin</h2>
              <p className="text-gray-600">Gestisci il tuo fantacalcio</p>
            </div>
            <div className="flex-1 flex justify-end">
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="flex items-center space-x-2 px-3 py-2 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                title="Logout"
              >
                <FaSignOutAlt className="w-4 h-4" />
                <span>{isLoggingOut ? 'Uscendo...' : 'Esci'}</span>
              </button>
            </div>
          </div>
        </div>
       
        <ul className="flex flex-col space-y-3">
          {adminCommands.map((command, index) => (
            <li key={index} className="border-gray-200 border rounded-lg overflow-hidden">
              <Link href={command.href} className="block">
                <div className="select-none cursor-pointer bg-white hover:bg-gray-50 flex items-center p-4 transition duration-300 ease-in-out transform hover:scale-[1.02] hover:shadow-md">
                  <div className={`flex justify-center items-center w-12 h-12 rounded-lg mr-4 ${command.color}`}>
                    <command.icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-800 text-lg">{command.title}</div>
                    <div className="text-gray-600 text-sm">{command.description}</div>
                  </div>
                  <div className="text-gray-400 ml-4">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}