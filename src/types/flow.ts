/**
 * 플로우 빌더 타입 정의
 * React Flow 기반 공정/업무 흐름 설계
 */

import type { Node, Edge, Viewport } from 'reactflow';

// ============================================================
// 노드 타입
// ============================================================

export type FlowNodeType =
  | 'start'       // 시작점
  | 'end'         // 종료점
  | 'process'     // 공정 작업
  | 'decision'    // 분기 조건
  | 'parallel'    // 병렬 분기
  | 'merge'       // 병렬 합류
  | 'delay'       // 대기/지연
  | 'notification'; // 알림

export interface FlowNodeData {
  label: string;
  description?: string;
  nodeType: FlowNodeType;
  config?: Record<string, unknown>; // 노드별 설정
  // process 노드용
  processId?: string;
  equipmentId?: string;
  duration?: number; // 분
  // decision 노드용
  conditions?: Array<{ label: string; expression: string }>;
}

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge;

// ============================================================
// 플로우 전체 정의
// ============================================================

export type FlowStatus = 'DRAFT' | 'SIMULATED' | 'ACTIVE' | 'ARCHIVED';

export interface FlowDefinition {
  id: string;
  name: string;
  description?: string | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport: Viewport;
  status: FlowStatus;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// 시뮬레이션
// ============================================================

export type SimulationStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'TIMEOUT';

export interface SimulationError {
  nodeId?: string;
  edgeId?: string;
  type: 'UNREACHABLE_NODE' | 'INFINITE_LOOP' | 'MISSING_CONDITION' | 'VALIDATION_ERROR';
  message: string;
}

export interface SimulationResult {
  executionPath: string[];   // 실행된 노드 ID 순서
  totalDuration: number;     // 예상 총 소요 시간 (분)
  warnings: string[];
}

export interface Simulation {
  id: string;
  flowId: string;
  status: SimulationStatus;
  snapshot: Pick<FlowDefinition, 'nodes' | 'edges'>;
  result?: SimulationResult | null;
  errors?: SimulationError[] | null;
  ranAt?: Date | null;
  duration?: number | null; // ms
  createdAt: Date;
}
