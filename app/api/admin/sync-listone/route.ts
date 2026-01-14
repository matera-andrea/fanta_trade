import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, RolePlayer } from "@prisma/client";
import ExcelJS from "exceljs";

const prisma = new PrismaClient();

// Mappatura Ruoli Excel -> Prisma
const mapRole = (roleChar: string): RolePlayer => {
  const normalized = roleChar.trim().toUpperCase();
  switch (normalized) {
    case "P": return "PORTIERE";
    case "D": return "DIFENSORE";
    case "C": return "CENTROCAMPISTA";
    case "A": return "ATTACCANTE";
    default: return "CENTROCAMPISTA"; // Fallback
  }
};

export async function POST(req: NextRequest) {
  try {
    // ------------------------------------------------------------------
    // 1. RICEZIONE E LETTURA FILE
    // ------------------------------------------------------------------
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Nessun file caricato" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const workbookInput = new ExcelJS.Workbook();
    // "as any" per risolvere il conflitto di tipi Buffer tra Node e Next.js
    await workbookInput.xlsx.load(buffer as any);
    
    const sheetInput = workbookInput.getWorksheet(1);
    if (!sheetInput) throw new Error("Foglio Excel non valido");

    const excelIds: number[] = [];
    const upsertOperations: any[] = [];

    // ------------------------------------------------------------------
    // 2. IMPORTAZIONE (UPSERT)
    // ------------------------------------------------------------------
    console.log("Inizio lettura righe Excel...");

    sheetInput.eachRow((row, rowNumber) => {
      // Salta Titolo (1) e Header (2)
      if (rowNumber <= 2) return; 

      // Mappatura colonne: 1:Id, 2:Ruolo, 4:Nome, 5:Squadra, 6:Quotazione
      const idVal = row.getCell(1).value;
      const roleVal = row.getCell(2).value;
      const nameVal = row.getCell(4).value;
      const teamVal = row.getCell(5).value;
      const qtaVal = row.getCell(6).value;

      if (idVal && roleVal && nameVal) {
        const id = Number(idVal);
        const roleEnum = mapRole(String(roleVal));
        const realTeam = String(teamVal || "Svincolato");
        const value = Number(qtaVal || 1);
        const lastname = String(nameVal);

        excelIds.push(id);

        // Prepariamo l'operazione
        upsertOperations.push(
          prisma.player.upsert({
            where: { id },
            update: {
              lastname,
              realteam: realTeam,
              value,
              role: roleEnum,
            },
            create: {
              id,
              lastname,
              realteam: realTeam,
              value,
              role: roleEnum,
              teamsCount: 0,
            },
          })
        );
      }
    });

    // Eseguiamo tutti gli aggiornamenti/inserimenti in parallelo
    await prisma.$transaction(upsertOperations);
    console.log(`Aggiornati/Creati ${excelIds.length} giocatori.`);

    // ------------------------------------------------------------------
    // 3. PULIZIA (DELETE)
    // ------------------------------------------------------------------
    // Troviamo tutti gli ID nel DB che NON sono nel file Excel
    const playersToDelete = await prisma.player.findMany({
      where: { id: { notIn: excelIds } },
      select: { id: true },
    });

    const idsToDelete = playersToDelete.map((p) => p.id);

    if (idsToDelete.length > 0) {
      console.log(`Eliminazione di ${idsToDelete.length} giocatori obsoleti...`);
      
      // Elimina referenze nelle squadre fantacalcio
      await prisma.teamPlayer.deleteMany({ where: { playerId: { in: idsToDelete } } });
      
      // Elimina referenze negli scambi
      await prisma.tradePlayer.deleteMany({ where: { playerId: { in: idsToDelete } } });
      
      // Elimina fisicamente i giocatori
      await prisma.player.deleteMany({ where: { id: { in: idsToDelete } } });
      
      console.log("Pulizia completata.");
    }

    // ------------------------------------------------------------------
    // 4. RECUPERO DATI E ORDINAMENTO
    // ------------------------------------------------------------------
    const playersData = await prisma.player.findMany({
      include: { teams: true },
    });

    const rolePriority: Record<string, number> = {
      PORTIERE: 1,
      DIFENSORE: 2,
      CENTROCAMPISTA: 3,
      ATTACCANTE: 4,
    };

    const sortedPlayers = playersData.sort((a, b) => {
      // 1. Ordine Ruolo (P -> D -> C -> A)
      const roleDiff = rolePriority[a.role] - rolePriority[b.role];
      if (roleDiff !== 0) return roleDiff;

      // 2. Ordine Quotazione (Decrescente: dal più costoso al meno costoso)
      const valueDiff = b.value - a.value;
      if (valueDiff !== 0) return valueDiff;

      // 3. Ordine Alfabetico (A-Z)
      return a.lastname.localeCompare(b.lastname);
    });

    // ------------------------------------------------------------------
    // 5. GENERAZIONE EXCEL (EXPORT)
    // ------------------------------------------------------------------
    const workbookOutput = new ExcelJS.Workbook();
    const sheetOutput = workbookOutput.addWorksheet("Listone Aggiornato");

    // Header del file di output
    sheetOutput.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Cognome", key: "lastname", width: 25 },
      { header: "Ruolo", key: "role", width: 15 },
      { header: "Squadra", key: "realteam", width: 20 },
      { header: "Quotazione", key: "value", width: 12 },
      { header: "Copie Disp.", key: "copies", width: 15 },
    ];

    // Stile Header
    sheetOutput.getRow(1).font = { bold: true, size: 12 };
    sheetOutput.getRow(1).alignment = { horizontal: 'center' };

    for (const p of sortedPlayers) {
      const teamsCount = p.teams.length;
      const copiesAvailable = 3 - teamsCount;

      // Se non ci sono copie disponibili, non lo mettiamo nel listone (opzionale)
      // Se vuoi includerli anche se esauriti, rimuovi questo if
      if (copiesAvailable <= 0) continue;

      let fillColor = "FF00AA00"; // Verde (3 copie)
      if (copiesAvailable === 2) fillColor = "FFFF0000"; // Rosso (2 copie)
      if (copiesAvailable === 1) fillColor = "FF000000"; // Nero (1 copia)

      const row = sheetOutput.addRow({
        id: p.id,
        lastname: p.lastname,
        role: p.role,
        realteam: p.realteam,
        value: p.value,
        copies: copiesAvailable,
      });

      // Applica stile e colore a tutta la riga
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: fillColor },
        };
        cell.font = {
          color: { argb: "FFFFFFFF" }, // Bianco
          bold: true,
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      });
      
      // Centra colonne numeriche
      row.getCell(1).alignment = { horizontal: 'center' }; // ID
      row.getCell(5).alignment = { horizontal: 'center' }; // Quotazione
      row.getCell(6).alignment = { horizontal: 'center' }; // Copie
    }

    // ------------------------------------------------------------------
    // 6. INVIO RISPOSTA
    // ------------------------------------------------------------------
    const bufferOutput = await workbookOutput.xlsx.writeBuffer();

    return new NextResponse(bufferOutput as any, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Listone_Aggiornato_${new Date().toISOString().split('T')[0]}.xlsx"`,
      },
    });

  } catch (error) {
    console.error("Errore Sync:", error);
    return NextResponse.json(
      { error: "Errore durante l'elaborazione del file." },
      { status: 500 }
    );
  }
}