// Cliente Supabase para integração com banco de dados
const SUPABASE_URL = 'https://jhfwgucoaykbgoyqibdn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WCFJ3pqXM30no8I7rxsmFg_eXMQBdH0';

class SupabaseClient {
  constructor(url, key) {
    this.url = url;
    this.key = key;
    this.authToken = null;
  }

  // Salvar simulação facial no banco de dados
  async saveFaceSimulation(styleName, styleType, faceData = {}) {
    try {
      const response = await fetch(`${this.url}/rest/v1/face_simulations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.key,
          'Authorization': `Bearer ${this.authToken || this.key}`
        },
        body: JSON.stringify({
          style_name: styleName,
          style_type: styleType,
          face_data: faceData
        })
      });

      if (!response.ok) {
        throw new Error(`Erro ao salvar simulação: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Simulação salva com sucesso:', data);
      return data;
    } catch (error) {
      console.error('Erro ao salvar simulação:', error);
      return null;
    }
  }

  // Salvar agendamento
  async saveAppointment(service, barber, appointmentDate) {
    try {
      const response = await fetch(`${this.url}/rest/v1/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.key,
          'Authorization': `Bearer ${this.authToken || this.key}`
        },
        body: JSON.stringify({
          service: service,
          barber: barber,
          appointment_date: appointmentDate,
          status: 'pending'
        })
      });

      if (!response.ok) {
        throw new Error(`Erro ao salvar agendamento: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Agendamento salvo com sucesso:', data);
      return data;
    } catch (error) {
      console.error('Erro ao salvar agendamento:', error);
      return null;
    }
  }

  // Obter histórico de simulações
  async getFaceSimulations() {
    try {
      const response = await fetch(`${this.url}/rest/v1/face_simulations`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.key,
          'Authorization': `Bearer ${this.authToken || this.key}`
        }
      });

      if (!response.ok) {
        throw new Error(`Erro ao obter simulações: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Erro ao obter simulações:', error);
      return [];
    }
  }

  // Obter agendamentos
  async getAppointments() {
    try {
      const response = await fetch(`${this.url}/rest/v1/appointments`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.key,
          'Authorization': `Bearer ${this.authToken || this.key}`
        }
      });

      if (!response.ok) {
        throw new Error(`Erro ao obter agendamentos: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Erro ao obter agendamentos:', error);
      return [];
    }
  }

  // Atualizar perfil do usuário
  async updateProfile(fullName, avatarUrl) {
    try {
      const response = await fetch(`${this.url}/rest/v1/profiles`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.key,
          'Authorization': `Bearer ${this.authToken || this.key}`
        },
        body: JSON.stringify({
          full_name: fullName,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`Erro ao atualizar perfil: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Perfil atualizado com sucesso:', data);
      return data;
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      return null;
    }
  }

  // Executar query customizada
  async query(table, options = {}) {
    try {
      let url = `${this.url}/rest/v1/${table}`;
      
      // Construir query string
      const params = new URLSearchParams();
      if (options.select) params.append('select', options.select);
      if (options.filter) params.append('filter', options.filter);
      if (options.limit) params.append('limit', options.limit);
      if (options.offset) params.append('offset', options.offset);
      if (options.order) params.append('order', options.order);

      if (params.toString()) {
        url += '?' + params.toString();
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.key,
          'Authorization': `Bearer ${this.authToken || this.key}`
        }
      });

      if (!response.ok) {
        throw new Error(`Erro na query: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Erro na query:', error);
      return [];
    }
  }

  // Definir token de autenticação
  setAuthToken(token) {
    this.authToken = token;
  }
}

// Instância global do cliente Supabase
const supabaseClient = new SupabaseClient(SUPABASE_URL, SUPABASE_KEY);
