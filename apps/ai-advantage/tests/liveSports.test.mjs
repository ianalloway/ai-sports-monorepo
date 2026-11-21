import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("live slates retain games and available odds when other ESPN requests fail", async (t) => {
  const vite = await createServer({
    configFile: false,
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const { fetchLiveGamesForSports } = await vite.ssrLoadModule("/src/lib/liveSports.ts");
  const date = "2026-03-10T17:00:00Z";
  const game = (id) => ({
    id, date, shortName: id,
    competitions: [{
      competitors: [
        { homeAway: "home", team: { displayName: "Home Team" } },
        { homeAway: "away", team: { displayName: "Away Team" } },
      ],
    }],
  });
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/nba/scoreboard")) {
      return Response.json({ events: [game("with-odds"), game("no-odds")] });
    }
    if (url.pathname.endsWith("/nba/summary") && url.searchParams.get("event") === "with-odds") {
      return Response.json({ pickcenter: [{ homeTeamOdds: { moneyLine: -120 }, awayTeamOdds: { moneyLine: 110 } }] });
    }
    return new Response(null, { status: 503 });
  });

  const games = await fetchLiveGamesForSports(["nba", "nfl"], new Date(date));
  assert.deepEqual(games.map((entry) => entry.id), ["with-odds", "no-odds"]);
  assert.equal(games[0].odds.homeMoneyline, -120);
  assert.equal(games[0].odds.awayMoneyline, 110);
  assert.equal(games[1].odds, null);
  assert.deepEqual(await fetchLiveGamesForSports(["nfl"], new Date(date)), []);
});
