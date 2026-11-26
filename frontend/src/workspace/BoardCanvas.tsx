import { useEffect, useMemo } from 'react';
import { Background, BackgroundVariant, BaseEdge, Controls, Handle, Position, ReactFlow, useNodesState } from '@xyflow/react';
import type { Connection, Edge, EdgeProps, Node, NodeProps } from '@xyflow/react';
import type { BomItem } from '../index';
import { CARD_W, cardSpecs, Lane, Point, RAIL_H, railLabel } from './layout';

type RailNode = Node<{ rail: string; width: number }, 'rail'>;
type PartNode = Node<{ item: BomItem }, 'part'>;
type WireEdge = Edge<{ left: number; right: number; tone: string }, 'wire'>;

const railId = (rail: string) => `rail:${rail}`;

function Rail({ data }: NodeProps<RailNode>) {
  return (
    <div className="ws-rail" style={{ width: data.width, height: RAIL_H }}>
      <span className="ws-rail-name">{railLabel(data.rail)}</span>
      <Handle type="source" position={Position.Bottom} className="ws-rail-handle" />
    </div>
  );
}

function Part({ data, selected }: NodeProps<PartNode>) {
  const { item } = data;
  const status = item.compatibility.status;
  return (
    <div className={`ws-part is-${status}${selected ? ' is-sel' : ''}`} style={{ width: CARD_W }}>
      <Handle type="target" position={Position.Top} className="ws-port" />
      <span className="ws-part-top">
        <b>{item.designator || 'Part'}</b>
        <span className={`ws-dot is-${status}`} title={status === 'ok' ? 'Compatible' : status} />
      </span>
      <strong className="mono">{item.component.mpn}</strong>
      <small>{cardSpecs(item).join(' | ') || 'No specs'}</small>
      <small>
        Qty {item.quantity}
        {status !== 'ok' && <em>{status === 'error' ? 'Error' : 'Warning'}</em>}
        {item.component.supply_risk.level !== 'none' && <em>Supply risk</em>}
      </small>
    </div>
  );
}

/** Orthogonal tap: down from the rail directly above the part, like a bus on a schematic. */
function Wire({ sourceY, targetX, targetY, data }: EdgeProps<WireEdge>) {
  const tap = Math.min(Math.max(targetX, data!.left + 14), data!.right - 14);
  const mid = (sourceY + targetY) / 2;
  return <BaseEdge className={`ws-wire is-${data!.tone}`} path={`M ${tap},${sourceY} V ${mid} H ${targetX} V ${targetY}`} />;
}

const nodeTypes = { rail: Rail, part: Part };
const edgeTypes = { wire: Wire };

interface Props {
  lanes: Lane[];
  selected: string | null;
  canEdit: boolean;
  onSelect: (id: string | null) => void;
  onWire: (itemId: string, rail: string) => void;
  onMove: (itemId: string, position: Point) => void;
}

export function BoardCanvas({ lanes, selected, canEdit, onSelect, onWire, onMove }: Props) {
  const computed = useMemo<(RailNode | PartNode)[]>(
    () =>
      lanes.flatMap((lane) => [
        { id: railId(lane.rail), type: 'rail' as const, position: { x: lane.x, y: lane.y }, data: { rail: lane.rail, width: lane.width }, draggable: false, selectable: false },
        ...lane.parts.map(({ item, position }) => ({ id: item.id, type: 'part' as const, position, data: { item }, selected: item.id === selected })),
      ]),
    [lanes, selected],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(computed);
  // Keep React Flow's measurements while taking new data and positions.
  useEffect(() => {
    setNodes((old) => computed.map((n) => ({ ...old.find((o) => o.id === n.id), ...n }) as RailNode | PartNode));
  }, [computed, setNodes]);

  const edges: WireEdge[] = lanes.flatMap((lane) =>
    lane.parts.map(({ item }) => ({
      id: `wire:${item.id}`,
      type: 'wire' as const,
      source: railId(lane.rail),
      target: item.id,
      data: { left: lane.x, right: lane.x + lane.width, tone: item.id === selected && item.compatibility.status === 'ok' ? 'sel' : item.compatibility.status },
      selectable: false,
    })),
  );

  const connect = ({ source, target }: Connection) => {
    if (source?.startsWith('rail:') && target) onWire(target, source.slice(5));
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={(_, n) => n.type === 'part' && onSelect(n.id)}
      onPaneClick={() => onSelect(null)}
      onNodeDragStop={(_, n) => onMove(n.id, n.position)}
      onConnect={connect}
      nodesConnectable={canEdit}
      deleteKeyCode={null}
      connectionRadius={48}
      fitView
      fitViewOptions={{ padding: { top: '70px', right: '24px', bottom: '24px', left: '24px' }, maxZoom: 1.1 }}
      minZoom={0.3}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  );
}
