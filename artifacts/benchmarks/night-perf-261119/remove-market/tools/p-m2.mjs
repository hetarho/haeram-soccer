// M2: after the takeover only the owner's country's clubs take part in the NPC market (buyers and sellers).
const F = 'packages/engine/src/npc-market.ts';
export default [
  { file: F,
    from: "  const clubs = w.clubs.filter(\n    (c) => c.id !== w.playerClub && !c.representative && w.squads?.[c.id],\n  );",
    to: "  const ownCountry = w.playerClub !== '' ? w.clubs.find((c) => c.id === w.playerClub)?.country : undefined;\n  const clubs = w.clubs.filter(\n    (c) => c.id !== w.playerClub && !c.representative && w.squads?.[c.id] && (ownCountry === undefined || c.country === ownCountry),\n  );" },
];
