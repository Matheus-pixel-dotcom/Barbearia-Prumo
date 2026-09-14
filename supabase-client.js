// Cliente REST (PostgREST) do Supabase — Barbearia Prumo.
//
// SUPABASE_URL é a ORIGEM do projeto, SEM caminho. O sufixo /rest/v1 é adicionado uma
// única vez, por request(). (Antes a origem já vinha com "/rest/v1/" e cada método
// acrescentava "/rest/v1/" de novo, produzindo /rest/v1//rest/v1/<tabela> — rota
// inexistente, que falhava em silêncio.)
//
// Erros NÃO são engolidos: todo método rejeita com SupabaseRequestError, que carrega
// status, código PostgREST, corpo da resposta, método e URL. Quem chama decide se trata.
//
// Tudo roda dentro de uma IIFE para não vazar `const` para o escopo global da página —
// a colisão de nomes entre os <script> clássicos derrubava páginas inteiras.
(function () {
  'use strict';

  const SUPABASE_URL = 'https://jhfwgucoaykbgoyqibdn.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZndndWNvYXlrYmdveXFpYmRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDA2MTMsImV4cCI6MjA5NzE3NjYxM30.h8JmAb6Ifyw94rtmHRiegrvJLAC08knYK6Ez4bRyYCg';
  const REST_PATH = '/rest/v1';

  class SupabaseRequestError extends Error {
    constructor(message, details = {}) {
      super(message);
      this.name = 'SupabaseRequestError';
      this.status = details.status ?? null;
      this.code = details.code ?? null;
      this.body = details.body ?? null;
      this.method = details.method ?? null;
      this.url = details.url ?? null;
    }
  }

  class SupabaseClient {
    constructor(url, key) {
      // Normaliza a origem: remove barra final E um eventual sufixo "/rest/v1".
      // Assim o erro original (origem já com o caminho + método adicionando de novo)
      // não consegue voltar, nem por configuração equivocada.
      this.url = String(url).trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
      this.key = key;
      this.authToken = null;
    }

    setAuthToken(token) {
      this.authToken = token;
    }

    /**
     * Única porta de saída para o PostgREST.
     * @param {string} table  nome da tabela
     * @param {{method?:string, body?:any, params?:object, prefer?:string}} options
     */
    async request(table, options = {}) {
      const { method = 'GET', body, params, prefer } = options;

      const url = new URL(`${this.url}${REST_PATH}/${encodeURIComponent(table)}`);
      for (const [key, value] of Object.entries(params || {})) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }

      const headers = {
        'Content-Type': 'application/json',
        'apikey': this.key,
        'Authorization': `Bearer ${this.authToken || this.key}`,
      };
      if (prefer) headers['Prefer'] = prefer;

      let response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (networkError) {
        // Sem resposta HTTP (offline, CORS, DNS). Preserva a causa em vez de sumir com ela.
        throw new SupabaseRequestError(
          `Falha de rede em ${method} ${table}: ${networkError.message}`,
          { method, url: String(url), body: { cause: String(networkError) } }
        );
      }

      const raw = await response.text();
      let data = null;
      if (raw) {
        try { data = JSON.parse(raw); } catch { data = raw; }
      }

      if (!response.ok) {
        const detail = (data && (data.message || data.hint)) || response.statusText || 'sem detalhe';
        throw new SupabaseRequestError(
          `${method} ${table} falhou (HTTP ${response.status}): ${detail}`,
          {
            status: response.status,
            code: data && typeof data === 'object' ? data.code : null,
            body: data,
            method,
            url: String(url),
          }
        );
      }

      return data;
    }

    /** Salva uma simulação de visagismo. Rejeita em caso de erro. */
    saveFaceSimulation(styleName, styleType, faceData = {}) {
      return this.request('face_simulations', {
        method: 'POST',
        prefer: 'return=representation',
        body: {
          style_name: styleName,
          style_type: styleType,
          face_data: faceData,
        },
      });
    }

    /** Salva um agendamento. Rejeita em caso de erro. */
    saveAppointment(service, barber, appointmentDate) {
      return this.request('appointments', {
        method: 'POST',
        prefer: 'return=representation',
        body: {
          service,
          barber,
          appointment_date: appointmentDate,
          status: 'pending',
        },
      });
    }

    getFaceSimulations() {
      return this.request('face_simulations');
    }

    getAppointments() {
      return this.request('appointments');
    }

    updateProfile(fullName, avatarUrl) {
      return this.request('profiles', {
        method: 'PATCH',
        prefer: 'return=representation',
        body: {
          full_name: fullName,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        },
      });
    }

    /**
     * Query customizada. Rejeita em caso de erro — não devolve [] silenciosamente.
     * @param {string} table
     * @param {{select?:string, filter?:string, limit?:number, offset?:number, order?:string}} options
     */
    query(table, options = {}) {
      return this.request(table, {
        method: 'GET',
        params: {
          select: options.select,
          filter: options.filter,
          limit: options.limit,
          offset: options.offset,
          order: options.order,
        },
      });
    }
  }

  // Exportados explicitamente: admin.js e ia-camera.js usam `supabaseClient` por
  // identificador global, então precisa existir em window.
  window.SupabaseClient = SupabaseClient;
  window.SupabaseRequestError = SupabaseRequestError;
  window.supabaseClient = new SupabaseClient(SUPABASE_URL, SUPABASE_KEY);
})();
