import { describe, it, expect } from 'vitest';
import { NOVELFORGE_DAG } from '../../src/core/dag.js';

/**
 * DAG structure and approval flow validation tests.
 * These verify the DAG definition and approval workflow without
 * executing the full pipeline (which requires LLM access).
 */
describe('DAG Approval Flow', () => {
  it('has 2 approval nodes', () => {
    const approvalNodes = NOVELFORGE_DAG.nodes.filter(n => n.approvalRequired);
    expect(approvalNodes).toHaveLength(2);
    expect(approvalNodes[0].id).toBe('approval1');
    expect(approvalNodes[1].id).toBe('approval2');
  });

  it('approval1 depends on deepaudit', () => {
    const approval1 = NOVELFORGE_DAG.nodes.find(n => n.id === 'approval1')!;
    expect(approval1.dependencies).toContain('deepaudit');
  });

  it('approval2 depends on memoryupdate', () => {
    const approval2 = NOVELFORGE_DAG.nodes.find(n => n.id === 'approval2')!;
    expect(approval2.dependencies).toContain('memoryupdate');
  });

  it('analyst depends on approval1', () => {
    const analyst = NOVELFORGE_DAG.nodes.find(n => n.id === 'analyst')!;
    expect(analyst.dependencies).toContain('approval1');
  });

  it('no node depends on approval2 (it is terminal)', () => {
    const dependsOnApproval2 = NOVELFORGE_DAG.nodes.filter(n =>
      n.dependencies.includes('approval2')
    );
    expect(dependsOnApproval2).toHaveLength(0);
  });

  it('all edges reference valid nodes', () => {
    const nodeIds = new Set(NOVELFORGE_DAG.nodes.map(n => n.id));
    for (const [from, to] of NOVELFORGE_DAG.edges) {
      expect(nodeIds.has(from)).toBe(true);
      expect(nodeIds.has(to)).toBe(true);
    }
  });

  it('all node dependencies have corresponding edges', () => {
    const edgeSet = new Set(NOVELFORGE_DAG.edges.map(([a, b]) => `${a}->${b}`));
    for (const node of NOVELFORGE_DAG.nodes) {
      for (const dep of node.dependencies) {
        expect(edgeSet.has(`${dep}->${node.id}`)).toBe(true);
      }
    }
  });

  it('has correct node count', () => {
    expect(NOVELFORGE_DAG.nodes).toHaveLength(14);
  });

  it('writer has 4 dependencies (styleextractor, composer, preaudit, contextprep)', () => {
    const writer = NOVELFORGE_DAG.nodes.find(n => n.id === 'writer')!;
    expect(writer.dependencies).toHaveLength(4);
    expect(writer.dependencies).toContain('styleextractor');
    expect(writer.dependencies).toContain('composer');
    expect(writer.dependencies).toContain('preaudit');
    expect(writer.dependencies).toContain('contextprep');
  });
});
