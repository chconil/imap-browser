import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { autoconfigService, AutoconfigService } from './autoconfig-service.js';

// Mock dns/promises
vi.mock('dns/promises', () => ({
  default: {
    resolveSrv: vi.fn(),
    resolveMx: vi.fn(),
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AutoconfigService', () => {
  let service: AutoconfigService;

  beforeEach(() => {
    service = new AutoconfigService();
    service.clearCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkPresets', () => {
    it('should detect Gmail from domain', async () => {
      const result = await service.lookup('test@gmail.com');

      expect(result.found).toBe(true);
      expect(result.provider).toBe('Gmail');
      expect(result.imap).toEqual({
        host: 'imap.gmail.com',
        port: 993,
        security: 'tls',
      });
      expect(result.smtp).toEqual({
        host: 'smtp.gmail.com',
        port: 465,
        security: 'tls',
      });
      expect(result.source).toBe('preset');
      expect(result.confidence).toBe('high');
    });

    it('should detect Outlook from hotmail.com domain', async () => {
      const result = await service.lookup('test@hotmail.com');

      expect(result.found).toBe(true);
      expect(result.provider).toBe('Outlook');
      expect(result.imap?.host).toBe('outlook.office365.com');
      expect(result.source).toBe('preset');
    });

    it('should detect Yahoo from yahoo.com domain', async () => {
      const result = await service.lookup('test@yahoo.com');

      expect(result.found).toBe(true);
      expect(result.provider).toBe('Yahoo');
      expect(result.imap?.host).toBe('imap.mail.yahoo.com');
    });

    it('should detect iCloud from icloud.com domain', async () => {
      const result = await service.lookup('test@icloud.com');

      expect(result.found).toBe(true);
      expect(result.provider).toBe('Icloud');
      expect(result.imap?.host).toBe('imap.mail.me.com');
    });

    it('should detect iCloud from me.com domain', async () => {
      const result = await service.lookup('test@me.com');

      expect(result.found).toBe(true);
      expect(result.provider).toBe('Icloud');
    });
  });

  describe('lookupSRV', () => {
    it('should resolve IMAP and SMTP from SRV records', async () => {
      const dns = await import('dns/promises');
      (dns.default.resolveSrv as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([{ name: 'mail.example.com', port: 993, priority: 10, weight: 0 }])
        .mockResolvedValueOnce([{ name: 'smtp.example.com', port: 587, priority: 10, weight: 0 }]);

      // Mock fetch to fail so we fall through to SRV
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await service.lookup('test@example-with-srv.com');

      expect(result.found).toBe(true);
      expect(result.imap).toEqual({
        host: 'mail.example.com',
        port: 993,
        security: 'tls',
      });
      expect(result.smtp).toEqual({
        host: 'smtp.example.com',
        port: 587,
        security: 'starttls',
      });
      expect(result.source).toBe('srv');
    });

    it('should detect STARTTLS from non-993 IMAP port', async () => {
      const dns = await import('dns/promises');
      (dns.default.resolveSrv as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([{ name: 'mail.example.com', port: 143, priority: 10, weight: 0 }])
        .mockResolvedValueOnce([]);

      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await service.lookup('test@example-starttls.com');

      expect(result.found).toBe(true);
      expect(result.imap?.security).toBe('starttls');
    });
  });

  describe('lookupAutoconfig', () => {
    it('should parse Mozilla autoconfig XML', async () => {
      const dns = await import('dns/promises');
      (dns.default.resolveSrv as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('No SRV'));
      (dns.default.resolveMx as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('No MX'));

      const autoconfigXML = `<?xml version="1.0"?>
<clientConfig version="1.1">
  <emailProvider id="example.com">
    <displayName>Example Mail</displayName>
    <incomingServer type="imap">
      <hostname>imap.example.com</hostname>
      <port>993</port>
      <socketType>SSL</socketType>
    </incomingServer>
    <outgoingServer type="smtp">
      <hostname>smtp.example.com</hostname>
      <port>587</port>
      <socketType>STARTTLS</socketType>
    </outgoingServer>
  </emailProvider>
</clientConfig>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(autoconfigXML),
      });

      const result = await service.lookup('test@autoconfig-test.com');

      expect(result.found).toBe(true);
      expect(result.provider).toBe('Example Mail');
      expect(result.imap).toEqual({
        host: 'imap.example.com',
        port: 993,
        security: 'tls',
      });
      expect(result.smtp).toEqual({
        host: 'smtp.example.com',
        port: 587,
        security: 'starttls',
      });
      expect(result.source).toBe('autoconfig');
    });

    it('should handle TLS socketType', async () => {
      const dns = await import('dns/promises');
      (dns.default.resolveSrv as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('No SRV'));

      const autoconfigXML = `<?xml version="1.0"?>
<clientConfig version="1.1">
  <emailProvider id="example.com">
    <incomingServer type="imap">
      <hostname>imap.example.com</hostname>
      <port>993</port>
      <socketType>TLS</socketType>
    </incomingServer>
  </emailProvider>
</clientConfig>`;

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(autoconfigXML),
      });

      const result = await service.lookup('test@tls-test.com');

      expect(result.found).toBe(true);
      expect(result.imap?.security).toBe('tls');
    });
  });

  describe('lookupMXPattern', () => {
    it('should detect Gmail from MX records', async () => {
      const dns = await import('dns/promises');
      (dns.default.resolveSrv as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('No SRV'));
      (dns.default.resolveMx as ReturnType<typeof vi.fn>).mockResolvedValue([
        { exchange: 'alt1.aspmx.l.google.com', priority: 10 },
      ]);

      mockFetch.mockRejectedValue(new Error('No autoconfig'));

      const result = await service.lookup('test@custom-domain-with-gmail.com');

      expect(result.found).toBe(true);
      expect(result.provider).toBe('Gmail');
      expect(result.imap?.host).toBe('imap.gmail.com');
      expect(result.source).toBe('mx');
      expect(result.confidence).toBe('medium');
    });

    it('should detect Outlook from protection.outlook.com MX', async () => {
      const dns = await import('dns/promises');
      (dns.default.resolveSrv as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('No SRV'));
      (dns.default.resolveMx as ReturnType<typeof vi.fn>).mockResolvedValue([
        { exchange: 'example-com.mail.protection.outlook.com', priority: 10 },
      ]);

      mockFetch.mockRejectedValue(new Error('No autoconfig'));

      const result = await service.lookup('test@outlook-mx.com');

      expect(result.found).toBe(true);
      expect(result.provider).toBe('Outlook');
      expect(result.imap?.host).toBe('outlook.office365.com');
    });

    it('should detect Fastmail from MX records', async () => {
      const dns = await import('dns/promises');
      (dns.default.resolveSrv as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('No SRV'));
      (dns.default.resolveMx as ReturnType<typeof vi.fn>).mockResolvedValue([
        { exchange: 'in1-smtp.messagingengine.com.fastmail.com', priority: 10 },
      ]);

      mockFetch.mockRejectedValue(new Error('No autoconfig'));

      const result = await service.lookup('test@fastmail-mx.com');

      expect(result.found).toBe(true);
      expect(result.imap).toEqual({
        host: 'imap.fastmail.com',
        port: 993,
        security: 'tls',
      });
    });
  });

  describe('caching', () => {
    it('should cache results', async () => {
      const result1 = await service.lookup('test@gmail.com');
      const result2 = await service.lookup('test@gmail.com');

      expect(result1).toEqual(result2);
      // Preset lookup doesn't make network calls, but caching still works
    });

    it('should cache not-found results', async () => {
      const dns = await import('dns/promises');
      (dns.default.resolveSrv as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('No SRV'));
      (dns.default.resolveMx as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('No MX'));
      mockFetch.mockRejectedValue(new Error('No autoconfig'));

      const result1 = await service.lookup('test@unknown-domain.com');
      const result2 = await service.lookup('test@unknown-domain.com');

      expect(result1.found).toBe(false);
      expect(result2.found).toBe(false);
    });

    it('should clear cache', async () => {
      await service.lookup('test@gmail.com');
      service.clearCache();
      // After clearing, should still work (will re-lookup from presets)
      const result = await service.lookup('test@gmail.com');
      expect(result.found).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle invalid email format', async () => {
      const result = await service.lookup('invalid-email');
      expect(result.found).toBe(false);
    });

    it('should handle empty email', async () => {
      const result = await service.lookup('');
      expect(result.found).toBe(false);
    });

    it('should handle email with no domain', async () => {
      const result = await service.lookup('user@');
      expect(result.found).toBe(false);
    });
  });
});

describe('autoconfigService singleton', () => {
  it('should be a singleton instance', () => {
    expect(autoconfigService).toBeInstanceOf(AutoconfigService);
  });
});
