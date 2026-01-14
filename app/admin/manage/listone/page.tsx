"use client";

import { useState } from "react";

export default function AdminPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUploadAndSync = async () => {
    if (!file) {
      alert("Seleziona prima un file!");
      return;
    }

    setIsLoading(true);
    setStatus("Caricamento ed elaborazione in corso... Attendere.");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/admin/sync-listone", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Errore durante la sincronizzazione");
      }

      // Gestione del download del file restituito
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Listone_Aggiornato_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setStatus("Successo! Database aggiornato e Listone scaricato.");
    } catch (error) {
      console.error(error);
      setStatus("Errore: Qualcosa è andato storto. Controlla la console.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Amministrazione Mercato</h1>
      
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">Sincronizzazione Listone</h2>
        
        <p className="text-gray-600 mb-6 text-sm">
          Carica il file Excel delle quotazioni (aggiornamento listone). 
          Il sistema aggiornerà il database (inserimenti/cancellazioni) 
          e scaricherà automaticamente il nuovo file con i colori delle disponibilità.
        </p>

        <div className="mb-4">
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
          />
        </div>

        <button
          onClick={handleUploadAndSync}
          disabled={!file || isLoading}
          className={`w-full py-3 px-4 rounded-md font-bold text-white transition-colors
            ${isLoading || !file 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {isLoading ? "Elaborazione in corso..." : "Carica, Sincronizza e Scarica"}
        </button>

        {status && (
          <div className={`mt-4 p-3 rounded text-center font-medium
            ${status.includes("Errore") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}