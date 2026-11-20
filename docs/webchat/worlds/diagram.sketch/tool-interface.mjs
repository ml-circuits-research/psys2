// SPDX-License-Identifier: AGPL-3.0-only
import { readNativeToolInterface } from '../native-tool-interface.mjs?v=9997b3bd33';
import { chartToolInterface } from '../data.charts/declared-host.mjs?v=fc47c7ad6d';
import SOURCE from './native-interface-source.mjs?v=ada7f9df56';

export const diagramToolInterface = readNativeToolInterface(SOURCE, { imports: { 'data.charts': chartToolInterface } });
const declaration = diagramToolInterface.realize();
export const DIAGRAM_COMPONENTS = declaration.components;
export const DIAGRAM_TOOL_BINDINGS = declaration.bindings;
