    import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, RolePlayer } from "@prisma/client";
import ExcelJS from "exceljs";

// Istanzia Prisma (meglio usare un singleton in produzione, ma per ora va bene così)
const prisma = new PrismaClient();

// Funzione helper per mappare i ruoli
const mapRole = (roleChar: string): RolePlayer => {
  const normalized = roleChar.trim().toUpperCase();
  switch (normalized) {
    case "P": return "PORTIERE";
    case "D": return "DIFENSORE";
    case "C": return "CENTROCAMPISTA";
    case "A": return "ATTACCANTE";
    default: return "CENTROCAMPISTA"; // Fallback sicuro
  }
};

export async function POST(req: NextRequest) {
  try {
    // 1. RICEZIONE FILE
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Nessun file caricato" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. LETTURA ED ELABORAZIONE (IMPORT)
    const workbookInput = new ExcelJS.Workbook();
    await workbookInput.xlsx.load(buffer as any);
    const sheetInput = workbookInput.getWorksheet(1);

    if (!sheetInput) throw new Error("Foglio Excel non valido");

    const excelIds: number[] = [];
    const upsertOperations: any[] = [];

    // Ottimizzazione: Raccogli tutte le operazioni in memoria prima
    sheetInput.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return; // Salta Titolo e Header

      const idVal = row.getCell(1).value;
      const roleVal = row.getCell(2).value;
      const nameVal = row.getCell(4).value;
      const teamVal = row.getCell(5).value;
      const qtaVal = row.getCell(6).value;

      if (idVal && roleVal && nameVal) {
        const id = Number(idVal);
        excelIds.push(id);
        
        // Eseguiamo le operazioni in sequenza nel DB
        upsertOperations.push(async () => {
          await prisma.player.upsert({
            where: { id },
            update: {
              lastname: String(nameVal),
              realteam: String(teamVal || "Svincolato"),
              value: Number(qtaVal || 1),
              role: mapRole(String(roleVal)),
            },
            create: {
              id,
              lastname: String(nameVal),
              realteam: String(teamVal || "Svincolato"),
              value: Number(qtaVal || 1),
              role: mapRole(String(roleVal)),
              teamsCount: 0,
            },
          });
        });
      }
    });

    // Esegui upsert in parallelo (o sequenziale se preferisci sicurezza)
    await Promise.all(upsertOperations.map(op => op()));

    // 3. PULIZIA (DELETE)
    // Trova chi è nel DB ma non nel file Excel
    const playersToDelete = await prisma.player.findMany({
      where: { id: { notIn: excelIds } },
      select: { id: true },
    });

    const idsToDelete = playersToDelete.map((p) => p.id);

    if (idsToDelete.length > 0) {
      // Pulizia referenze
      await prisma.teamPlayer.deleteMany({ where: { playerId: { in: idsToDelete } } });
      await prisma.tradePlayer.deleteMany({ where: { playerId: { in: idsToDelete } } });
      // Eliminazione Player
      await prisma.player.deleteMany({ where: { id: { in: idsToDelete } } });
    }

    // 4. GENERAZIONE NUOVO LISTONE (EXPORT)
    // Recupera i dati aggiornati
    const updatedPlayers = await prisma.player.findMany({
      include: { teams: true },
      orderBy: { lastname: 'asc' }
    });

    const workbookOutput = new ExcelJS.Workbook();
    const sheetOutput = workbookOutput.addWorksheet("Listone Aggiornato");

    sheetOutput.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Cognome", key: "lastname", width: 25 },
      { header: "Ruolo", key: "role", width: 15 },
      { header: "Squadra", key: "realteam", width: 20 },
      { header: "Quotazione", key: "value", width: 10 },
      { header: "Copie Disp.", key: "copies", width: 15 },
    ];

    sheetOutput.getRow(1).font = { bold: true };

    for (const p of updatedPlayers) {
      const teamsCount = p.teams.length;
      const copiesAvailable = 3 - teamsCount;

      if (copiesAvailable <= 0) continue;

      let fillColor = "FF00AA00"; // Verde (3 copie)
      if (copiesAvailable === 2) fillColor = "FFFF0000"; // Rosso
      if (copiesAvailable === 1) fillColor = "FF000000"; // Nero

      const row = sheetOutput.addRow({
        id: p.id,
        lastname: p.lastname,
        role: p.role,
        realteam: p.realteam,
        value: p.value,
        copies: copiesAvailable,
      });

      // Styling della riga
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: fillColor },
        };
        cell.font = {
          color: { argb: "FFFFFFFF" }, // Bianco
          bold: true
        };
      });
    }

    // 5. RESTITUZIONE DEL FILE
    const bufferOutput = await workbookOutput.xlsx.writeBuffer();

    return new NextResponse(bufferOutput, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="Listone_Aggiornato.xlsx"',
      },
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Errore durante l'elaborazione" },
      { status: 500 }
    );
  }
}