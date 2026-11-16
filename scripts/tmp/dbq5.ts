import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const slips = await (db as any).issuedSlip.findMany({ select: { id:true, homeTeam:true, awayTeam:true, league:true, labelA:true, labelB:true, legsA:true, legsB:true, status:true, supervisorApproved:true, retroIssued:true, externalId:true, netProfit:true } });
  let mismatches = 0; let toxicApproved = 0;
  const toxic = ["esp.2","usa.1","fifa.friendly"];
  for (const s of slips) {
    const legsA = JSON.parse(s.legsA||"[]"), legsB = JSON.parse(s.legsB||"[]");
    const check = (legs:any[], label:string, side:string) => {
      for (const l of legs) {
        if (l.key === "HOME_O15" && label.includes("میهمان")) return `A-side key HOME_O15 but ${side} label says میهمان`;
        if (l.key === "AWAY_O15" && label.includes("میزبان")) return `A-side key AWAY_O15 but ${side} label says میزبان`;
      }
      return null;
    };
    const m1 = check(legsA, s.labelA||"", "A");
    const m2 = check(legsB, s.labelB||"", "B");
    if (m1 || m2) { mismatches++; console.log("MISMATCH:", s.homeTeam, s.awayTeam, "|", m1||"", m2||"", "| st:", s.status, "| app:", s.supervisorApproved); }
    const isToxic = toxic.some(t => (s.externalId||"").includes("espn-"+t)) || toxic.some(t => (s.league||"").toLowerCase().includes(t.replace("fifa.friendly","friendly").replace("esp.2","laliga").replace("usa.1","mls")));
    if (s.supervisorApproved && !s.retroIssued && (s.externalId||"").match(/espn-(esp\.2|usa\.1|fifa\.friendly)/)) { toxicApproved++; console.log("TOXIC-APPROVED:", s.homeTeam, s.awayTeam, "| league:", s.league, "| ext:", s.externalId, "| st:", s.status, "| profit:", s.netProfit); }
  }
  console.log("TOTAL slips:", slips.length, "| label-key mismatches:", mismatches, "| toxic approved:", toxicApproved);
  await db.$disconnect();
}
main();
