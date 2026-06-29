/**
 * DataSource + Mapper contract — the seam that lets the SON (Sound of Now)
 * family of apps share one audio pipeline across very different inputs.
 *
 * Every app in this family is the same shape:
 *
 *     DataSource ──snapshot──▶ Mapper (pure) ──params──▶ Interpolator ──▶ Engine ──▶ Audio
 *
 * - SONAR's source is live weather; its snapshot is a WeatherState.
 * - SONDE's source is a simulation clock + ephemeris; its snapshot is a SkySnapshot.
 * - A future sensor app (e.g. Sensy S1 Pro) implements the *same* DataSource
 *   interface, emitting a normalized snapshot, and provides its own pure Mapper.
 *   It then drops into an analogous engine with no changes to this contract.
 *
 * This module is documentation-as-code: it defines the interface via JSDoc
 * typedefs and a tiny runtime guard, so Phase 2 (sensor) is a drop-in.
 */

/**
 * @typedef {object} DataSource
 * A producer of normalized snapshots. Lifecycle mirrors SONAR's fetchers.
 * @property {() => (void|Promise<void>)} start - Begin producing snapshots.
 * @property {() => void} stop - Stop producing snapshots and release resources.
 * @property {(cb: (snapshot: any) => void) => void} onUpdate - Register a snapshot listener.
 */

/**
 * @typedef {(snapshot: any, ...context: any[]) => object} Mapper
 * A PURE function: snapshot → musical params object. No side effects, no audio
 * library imports — so it can be unit-tested in isolation. The returned object's
 * keys are classified by the app's interpolator config (continuous / discrete /
 * meta).
 */

/**
 * Development guard: assert that an object satisfies the DataSource interface.
 * Returns the source unchanged so it can wrap a constructor call inline.
 * @template T
 * @param {T} source
 * @returns {T}
 */
export function assertDataSource(source) {
  for (const method of ['start', 'stop', 'onUpdate']) {
    if (typeof source?.[method] !== 'function') {
      throw new TypeError(`DataSource is missing required method "${method}()"`);
    }
  }
  return source;
}
