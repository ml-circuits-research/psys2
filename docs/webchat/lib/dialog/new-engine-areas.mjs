// Application composition: native bindings are separate from the generic request runner.
import { createDrawingPropertyHost, DRAWING_PROPERTY_BINDINGS } from '../../worlds/art.draw/property-host.mjs?v=70c302d3e0';
export const NEW_ENGINE_AREAS = Object.freeze({
  draw: Object.freeze({
    world: 'art.draw', createHost: createDrawingPropertyHost,
    bindings: DRAWING_PROPERTY_BINDINGS.map(binding => Object.freeze({ ...binding, act: 'change', valueType: 'k.colours.colour', nameKey: 'name', valueKey: 'rgb' })),
    normalize(value, binding) { return binding.format === 'rgb' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null; },
  }),
});
