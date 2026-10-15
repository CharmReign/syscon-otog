'use client';

// Ranks come from the server (best score per quiz, summed); the signed-in user is highlighted.
export function LeaderboardTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground border-b">
            <th className="py-2 pr-4 font-medium w-16">Rank</th>
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium text-right">Score</th>
            <th className="py-2 font-medium text-right">Quizzes passed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.rank} className={`border-b last:border-0 ${r.isMe ? 'bg-primary/10' : ''}`}>
              <td className="py-2.5 pr-4 tabular-nums">{r.rank}</td>
              <td className="py-2.5 pr-4">{r.name}{r.isMe && <span className="text-xs text-primary ml-2">(you)</span>}</td>
              <td className="py-2.5 pr-4 text-right font-semibold text-primary tabular-nums">{r.points.toLocaleString()}</td>
              <td className="py-2.5 text-right tabular-nums">{r.passed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
