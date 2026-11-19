// The avatar view: the generic SOP area view over the ui.avatar projection (worlds/ui.avatar/area.sop).
import {createSopAreaView} from './sop-area-view.mjs';
export const createAvatar = (container, host = null, { editor = false } = {}) => createSopAreaView(container, host, { world: 'ui.avatar', view: 'avatar', editor });
