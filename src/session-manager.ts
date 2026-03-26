import { createVeniceE2EE, isE2EEModel } from 'venice-e2ee';
import type { E2EESession, VeniceE2EEOptions } from 'venice-e2ee';
import type { ProxyConfig } from './config.js';
import { logger } from './logger.js';

/**
 * Manages E2EE sessions across multiple models.
 * Each model gets its own createVeniceE2EE instance, which internally
 * caches a single session with TTL and deduplicates concurrent creation.
 *
 * Thread-safety for parallel requests:
 * - Session creation is deduplicated per model by the library
 * - Encryption is stateless (fresh IVs per call)
 * - Decryption is stateless (per-chunk ephemeral keys from server)
 * - So multiple requests sharing a session is safe
 */
export class SessionManager {
  private instances = new Map<string, ReturnType<typeof createVeniceE2EE>>();
  private config: ProxyConfig;
  private dcapVerifier?: VeniceE2EEOptions['dcapVerifier'];

  constructor(config: ProxyConfig) {
    this.config = config;
  }

  /**
   * Lazily initialize DCAP verifier if enabled.
   */
  private async getDcapVerifier(): Promise<VeniceE2EEOptions['dcapVerifier']> {
    if (!this.config.enable_dcap) return undefined;
    if (this.dcapVerifier) return this.dcapVerifier;

    try {
      const { createDcapVerifier } = await import('venice-e2ee/dcap');
      this.dcapVerifier = createDcapVerifier();
      logger.info('DCAP verifier initialized');
      return this.dcapVerifier;
    } catch (e) {
      logger.warn('Failed to initialize DCAP verifier. Install @phala/dcap-qvl for full DCAP support.', e);
      return undefined;
    }
  }

  /**
   * Get or create an E2EE instance for a specific model.
   * Each instance caches one session internally.
   */
  private getOrCreateInstance(modelId: string): ReturnType<typeof createVeniceE2EE> {
    let instance = this.instances.get(modelId);
    if (!instance) {
      instance = createVeniceE2EE({
        apiKey: this.config.venice_api_key,
        baseUrl: this.config.venice_base_url,
        sessionTTL: this.config.session_ttl,
        verifyAttestation: this.config.verify_attestation,
        dcapVerifier: this.dcapVerifier,
      });
      this.instances.set(modelId, instance);
      logger.debug(`Created E2EE instance for model: ${modelId}`);
    }
    return instance;
  }

  /**
   * Get an active E2EE session for a model.
   * Creates a new session if needed (with attestation verification).
   * Concurrent calls for the same model are deduplicated by the library.
   */
  async getSession(modelId: string): Promise<{
    session: E2EESession;
    instance: ReturnType<typeof createVeniceE2EE>;
  }> {
    // Ensure DCAP verifier is loaded before creating instances
    if (this.config.enable_dcap && !this.dcapVerifier) {
      await this.getDcapVerifier();
    }

    const instance = this.getOrCreateInstance(modelId);
    const session = await instance.createSession(modelId);
    return { session, instance };
  }

  /**
   * Invalidate a session for a specific model (e.g., on stale session error).
   * The next getSession call will create a fresh session.
   */
  invalidateSession(modelId: string): void {
    const instance = this.instances.get(modelId);
    if (instance) {
      instance.clearSession();
      this.instances.delete(modelId);
      logger.info(`Invalidated session for model: ${modelId}`);
    }
  }

  /**
   * Check if a model ID is an E2EE model.
   */
  isE2EE(modelId: string): boolean {
    return isE2EEModel(modelId);
  }

  /**
   * Clean up all sessions. Zeroizes private keys.
   */
  destroy(): void {
    for (const [modelId, instance] of this.instances) {
      instance.clearSession();
      logger.debug(`Cleared session for model: ${modelId}`);
    }
    this.instances.clear();
  }
}
