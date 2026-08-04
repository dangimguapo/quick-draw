function playerSafeBeatResult(result, playerId) {
  if (!result) return result;
  return {
    ...result,
    events: (result.events ?? []).map((event) => {
      if (
        event.type !== "bulletsStolen" ||
        event.actorId === playerId ||
        event.targetId === playerId
      ) {
        return { ...event };
      }
      const { amount: _privateAmount, ...safeEvent } = event;
      return safeEvent;
    }),
  };
}

export { playerSafeBeatResult };
