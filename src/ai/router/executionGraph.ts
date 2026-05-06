export interface GraphNode<TContext> {
  id: string;
  dependsOn?: string[];
  run: (context: TContext) => Promise<void> | void;
}

export async function executeGraph<TContext>(nodes: GraphNode<TContext>[], context: TContext): Promise<TContext> {
  const completed = new Set<string>();
  const pending = new Map(nodes.map((node) => [node.id, node]));

  while (pending.size > 0) {
    const ready = [...pending.values()].filter((node) => (node.dependsOn ?? []).every((dependency) => completed.has(dependency)));
    if (ready.length === 0) {
      throw new Error("Execution graph contains a cycle or unresolved dependency");
    }

    await Promise.all(ready.map(async (node) => {
      await node.run(context);
      completed.add(node.id);
      pending.delete(node.id);
    }));
  }

  return context;
}
