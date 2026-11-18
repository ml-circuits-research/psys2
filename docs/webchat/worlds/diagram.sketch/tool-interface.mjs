// SPDX-License-Identifier: AGPL-3.0-only
import { readNativeToolInterface } from '../native-tool-interface.mjs?v=70dc2d3ab9';
import { chartToolInterface } from '../data.charts/declared-host.mjs?v=8672c45c1a';
import SOURCE from './native-interface-source.mjs?v=6b86a6d84d';

export const diagramToolInterface = readNativeToolInterface(SOURCE, { imports: { 'data.charts': chartToolInterface } });
const declaration = diagramToolInterface.realize();
export const DIAGRAM_COMPONENTS = declaration.components;
export const DIAGRAM_TOOL_BINDINGS = declaration.bindings;
