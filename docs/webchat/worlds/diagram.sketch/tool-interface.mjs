// SPDX-License-Identifier: AGPL-3.0-only
import { readNativeToolInterface } from '../native-tool-interface.mjs?v=3628e649ea';
import { chartToolInterface } from '../data.charts/declared-host.mjs?v=0dfedad783';
import SOURCE from './native-interface-source.mjs?v=ada7f9df56';

export const diagramToolInterface = readNativeToolInterface(SOURCE, { imports: { 'data.charts': chartToolInterface } });
const declaration = diagramToolInterface.realize();
export const DIAGRAM_COMPONENTS = declaration.components;
export const DIAGRAM_TOOL_BINDINGS = declaration.bindings;
