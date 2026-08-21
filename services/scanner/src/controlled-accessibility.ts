export {
  accessibilityFixtureIdSchema,
  getAccessibilityFixtureDefinition,
  listAccessibilityFixtureIds,
  type AccessibilityFixtureDefinition,
  type AccessibilityFixtureId,
} from "./controlled-fixtures/accessibility-catalog.js";
export {
  runControlledAccessibilityFixture,
  type ControlledAccessibilityRunResult,
} from "./controlled-fixtures/run-controlled-accessibility-fixture.js";
export {
  accessibilityEngineMetadata,
  collectAccessibility,
  type AccessibilityCollectionResult,
} from "./accessibility/collect-accessibility.js";
export { normalizeAxeResults } from "./accessibility/normalize-axe-results.js";
