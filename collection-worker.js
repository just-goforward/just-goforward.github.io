importScripts("collection-solver.js");

self.onmessage = (event) => {
  const data = event.data || {};
  if (data.type !== "solve") return;

  try {
    const result = self.CollectionSolver.solve(data.input, (progress) => {
      self.postMessage({ type: "progress", id: data.id, progress });
    });
    self.postMessage({ type: "result", id: data.id, result });
  } catch (error) {
    self.postMessage({
      type: "error",
      id: data.id,
      message: error && error.message ? error.message : String(error),
    });
  }
};
