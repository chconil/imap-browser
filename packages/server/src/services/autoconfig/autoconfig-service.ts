import dns from 'dns/promises';
import type { AutoconfigResult, ServerSettings } from '@imap-browser/shared';
import { emailProviders } from '@imap-browser/shared';

// Cache for autoconfig results (24-hour TTL)
const cache = new Map<string, { result: AutoconfigResult; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REQUEST_TIMEOUT_MS = 5000; // 5 seconds

// Domain to preset mapping
const DOMAIN_PRESETS: Record<string, keyof typeof emailProviders> = {
  'gmail.com': 'gmail',
  'googlemail.com': 'gmail',
  'outlook.com': 'outlook',
  'hotmail.com': 'outlook',
  'live.com': 'outlook',
  'msn.com': 'outlook',
  'yahoo.com': 'yahoo',
  'yahoo.co.uk': 'yahoo',
  'ymail.com': 'yahoo',
  'icloud.com': 'icloud',
  'me.com': 'icloud',
  'mac.com': 'icloud',
};

// MX record patterns to detect provider
const MX_PATTERNS: Record<string, keyof typeof emailProviders | { imap: ServerSettings; smtp: ServerSettings }> = {
  'google.com': 'gmail',
  'googlemail.com': 'gmail',
  'outlook.com': 'outlook',
  'protection.outlook.com': 'outlook',
  'yahoodns.net': 'yahoo',
  'icloud.com': 'icloud',
  'me.com': 'icloud',
  'fastmail.com': {
    imap: { host: 'imap.fastmail.com', port: 993, security: 'tls' },
    smtp: { host: 'smtp.fastmail.com', port: 465, security: 'tls' },
  },
  'zoho.com': {
    imap: { host: 'imap.zoho.com', port: 993, security: 'tls' },
    smtp: { host: 'smtp.zoho.com', port: 465, security: 'tls' },
  },
  'protonmail.ch': {
    imap: { host: 'imap.protonmail.ch', port: 993, security: 'tls' },
    smtp: { host: 'smtp.protonmail.ch', port: 465, security: 'tls' },
  },
};

export class AutoconfigService {
  /**
   * Look up email configuration for a given email address
   */
  async lookup(email: string): Promise<AutoconfigResult> {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) {
      return { found: false };
    }

    // Check cache first
    const cached = cache.get(domain);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.result;
    }

    // Cascading lookup strategy
    let result: AutoconfigResult;

    // 1. Check domain presets
    result = this.checkPresets(domain);
    if (result.found) {
      this.cacheResult(domain, result);
      return result;
    }

    // 2. Try DNS SRV records (RFC 6186)
    result = await this.lookupSRV(domain);
    if (result.found) {
      this.cacheResult(domain, result);
      return result;
    }

    // 3. Try Mozilla autoconfig
    result = await this.lookupAutoconfig(domain);
    if (result.found) {
      this.cacheResult(domain, result);
      return result;
    }

    // 4. Try Mozilla ISPDB
    result = await this.lookupISPDB(domain);
    if (result.found) {
      this.cacheResult(domain, result);
      return result;
    }

    // 5. Try MX record pattern matching
    result = await this.lookupMXPattern(domain);
    if (result.found) {
      this.cacheResult(domain, result);
      return result;
    }

    // Cache the not-found result too
    const notFound: AutoconfigResult = { found: false };
    this.cacheResult(domain, notFound);
    return notFound;
  }

  /**
   * Check against known domain presets
   */
  private checkPresets(domain: string): AutoconfigResult {
    const providerKey = DOMAIN_PRESETS[domain];
    if (providerKey && emailProviders[providerKey]) {
      const preset = emailProviders[providerKey];
      return {
        found: true,
        provider: providerKey.charAt(0).toUpperCase() + providerKey.slice(1),
        imap: {
          host: preset.imapHost,
          port: preset.imapPort,
          security: preset.imapSecurity,
        },
        smtp: {
          host: preset.smtpHost,
          port: preset.smtpPort,
          security: preset.smtpSecurity,
        },
        source: 'preset',
        confidence: 'high',
      };
    }
    return { found: false };
  }

  /**
   * Look up DNS SRV records (RFC 6186)
   */
  private async lookupSRV(domain: string): Promise<AutoconfigResult> {
    try {
      const [imapSrv, smtpSrv] = await Promise.all([
        this.resolveSRV(`_imaps._tcp.${domain}`).catch(() => null),
        this.resolveSRV(`_submission._tcp.${domain}`).catch(() => null),
      ]);

      // Need at least IMAP to consider this successful
      if (imapSrv) {
        return {
          found: true,
          imap: {
            host: imapSrv.name,
            port: imapSrv.port,
            security: imapSrv.port === 993 ? 'tls' : 'starttls',
          },
          smtp: smtpSrv
            ? {
                host: smtpSrv.name,
                port: smtpSrv.port,
                security: smtpSrv.port === 465 ? 'tls' : 'starttls',
              }
            : undefined,
          source: 'srv',
          confidence: 'high',
        };
      }
    } catch {
      // SRV lookup failed, continue to next method
    }
    return { found: false };
  }

  /**
   * Resolve a single SRV record
   */
  private async resolveSRV(
    hostname: string,
  ): Promise<{ name: string; port: number; priority: number; weight: number } | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const records = await dns.resolveSrv(hostname);
      clearTimeout(timeout);

      if (records.length === 0) return null;

      // Sort by priority (lower is better), then by weight (higher is better)
      records.sort((a, b) => a.priority - b.priority || b.weight - a.weight);
      return records[0];
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  /**
   * Look up Mozilla autoconfig (domain's own config)
   */
  private async lookupAutoconfig(domain: string): Promise<AutoconfigResult> {
    const urls = [
      `https://autoconfig.${domain}/mail/config-v1.1.xml`,
      `https://${domain}/.well-known/autoconfig/mail/config-v1.1.xml`,
    ];

    for (const url of urls) {
      try {
        const result = await this.fetchAndParseAutoconfig(url);
        if (result.found) {
          return { ...result, source: 'autoconfig' };
        }
      } catch {
        // Continue to next URL
      }
    }
    return { found: false };
  }

  /**
   * Look up Mozilla ISPDB (Thunderbird database)
   */
  private async lookupISPDB(domain: string): Promise<AutoconfigResult> {
    try {
      const url = `https://autoconfig.thunderbird.net/v1.1/${domain}`;
      const result = await this.fetchAndParseAutoconfig(url);
      if (result.found) {
        return { ...result, source: 'ispdb' };
      }
    } catch {
      // ISPDB lookup failed
    }
    return { found: false };
  }

  /**
   * Fetch and parse Mozilla autoconfig XML format
   */
  private async fetchAndParseAutoconfig(url: string): Promise<AutoconfigResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/xml, text/xml, */*',
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return { found: false };
      }

      const xml = await response.text();
      return this.parseAutoconfigXML(xml);
    } catch {
      clearTimeout(timeout);
      return { found: false };
    }
  }

  /**
   * Parse Mozilla autoconfig XML format
   */
  private parseAutoconfigXML(xml: string): AutoconfigResult {
    // Extract provider display name
    const providerMatch = xml.match(/<displayName>([^<]+)<\/displayName>/);
    const provider = providerMatch?.[1];

    // Extract IMAP server
    const imapMatch = xml.match(
      /<incomingServer[^>]*type="imap"[^>]*>[\s\S]*?<hostname>([^<]+)<\/hostname>[\s\S]*?<port>(\d+)<\/port>[\s\S]*?<socketType>([^<]+)<\/socketType>[\s\S]*?<\/incomingServer>/i,
    );

    // Extract SMTP server
    const smtpMatch = xml.match(
      /<outgoingServer[^>]*type="smtp"[^>]*>[\s\S]*?<hostname>([^<]+)<\/hostname>[\s\S]*?<port>(\d+)<\/port>[\s\S]*?<socketType>([^<]+)<\/socketType>[\s\S]*?<\/outgoingServer>/i,
    );

    if (!imapMatch) {
      return { found: false };
    }

    const parseSecurity = (socketType: string): 'tls' | 'starttls' | 'none' => {
      const lower = socketType.toLowerCase();
      if (lower === 'ssl' || lower === 'tls') return 'tls';
      if (lower === 'starttls') return 'starttls';
      return 'none';
    };

    return {
      found: true,
      provider,
      imap: {
        host: imapMatch[1],
        port: parseInt(imapMatch[2], 10),
        security: parseSecurity(imapMatch[3]),
      },
      smtp: smtpMatch
        ? {
            host: smtpMatch[1],
            port: parseInt(smtpMatch[2], 10),
            security: parseSecurity(smtpMatch[3]),
          }
        : undefined,
      confidence: 'medium',
    };
  }

  /**
   * Look up MX records and match against known patterns
   */
  private async lookupMXPattern(domain: string): Promise<AutoconfigResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const mxRecords = await dns.resolveMx(domain);
      clearTimeout(timeout);

      if (mxRecords.length === 0) {
        return { found: false };
      }

      // Sort by priority (lower is better)
      mxRecords.sort((a, b) => a.priority - b.priority);

      // Check each MX record against known patterns
      for (const mx of mxRecords) {
        const mxHost = mx.exchange.toLowerCase();

        for (const [pattern, config] of Object.entries(MX_PATTERNS)) {
          if (mxHost.includes(pattern)) {
            // If config is a string, it's a preset key
            if (typeof config === 'string') {
              const preset = emailProviders[config];
              if (preset) {
                return {
                  found: true,
                  provider: config.charAt(0).toUpperCase() + config.slice(1),
                  imap: {
                    host: preset.imapHost,
                    port: preset.imapPort,
                    security: preset.imapSecurity,
                  },
                  smtp: {
                    host: preset.smtpHost,
                    port: preset.smtpPort,
                    security: preset.smtpSecurity,
                  },
                  source: 'mx',
                  confidence: 'medium',
                };
              }
            } else {
              // Direct server config
              return {
                found: true,
                imap: config.imap,
                smtp: config.smtp,
                source: 'mx',
                confidence: 'medium',
              };
            }
          }
        }
      }
    } catch {
      // MX lookup failed
    }
    return { found: false };
  }

  /**
   * Cache a result
   */
  private cacheResult(domain: string, result: AutoconfigResult): void {
    cache.set(domain, { result, timestamp: Date.now() });
  }

  /**
   * Clear the cache (useful for testing)
   */
  clearCache(): void {
    cache.clear();
  }
}

// Singleton instance
export const autoconfigService = new AutoconfigService();
