# Implementação de IA e Banco de Dados - Estúdio Prumo

## 📋 Resumo das Mudanças

Este documento descreve a implementação de **reconhecimento facial em tempo real** e **integração com banco de dados Supabase** para o projeto Barbearia Prumo.

---

## 🎥 Reconhecimento Facial em Tempo Real

### Arquivo: `face-recognition.html` e `face-recognition.js`

#### Funcionalidades Implementadas:

1. **Captura de Vídeo em Tempo Real**
   - Acesso à câmera do dispositivo via `getUserMedia()`
   - Suporte para desktop e mobile
   - Controles para iniciar/parar a câmera

2. **Detecção Facial com IA**
   - Utiliza a biblioteca **Face-API.js** (modelo TinyFaceDetector)
   - Detecção de landmarks (pontos faciais)
   - Análise de expressões faciais
   - Estimativa de idade e gênero

3. **Análise de Características Faciais**
   - **Formato do Rosto**: Oval, Round, Square, Oblong
   - **Simetria**: Percentual de simetria facial
   - **Proporção da Fronte**: Relação entre altura da fronte e altura total
   - **Confiança**: Nível de confiança da detecção (0-100%)

4. **Recomendações Personalizadas**
   - Sugestões de corte baseadas no formato do rosto
   - 3 estilos principais: Executive Contour, Mid Fade, Buzz Cut
   - Descrições detalhadas de cada estilo

5. **Interface Responsiva**
   - Design adaptado para mobile e desktop
   - Visualização em tempo real com caixa de detecção
   - Painel de análise com métricas e recomendações

#### Como Usar:

```html
<!-- Adicionar link na navegação -->
<a href="face-recognition.html">Câmera IA</a>

<!-- Ou acessar diretamente -->
https://seu-dominio.com/face-recognition.html
```

#### Fluxo de Uso:

1. Usuário clica em "Iniciar câmera"
2. Permite acesso à câmera (primeira vez)
3. Sistema detecta rosto em tempo real
4. Exibe análise de características faciais
5. Mostra recomendações de corte personalizadas
6. Usuário pode agendar diretamente via WhatsApp

---

## 🗄️ Banco de Dados Supabase

### Projeto Criado: `Barbearia Prumo`

**URL**: https://jhfwgucoaykbgoyqibdn.supabase.co

### Tabelas Criadas:

#### 1. **profiles**
Armazena informações de perfil do usuário.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE
);
```

**Campos:**
- `id`: ID único do usuário (vinculado ao Auth)
- `full_name`: Nome completo do usuário
- `avatar_url`: URL da foto de perfil
- `updated_at`: Data da última atualização

#### 2. **appointments**
Armazena agendamentos de corte.

```sql
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  service TEXT NOT NULL,
  barber TEXT NOT NULL,
  appointment_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

**Campos:**
- `id`: ID único do agendamento
- `user_id`: ID do usuário
- `service`: Tipo de serviço (ex: "Corte Completo")
- `barber`: Nome do barbeiro
- `appointment_date`: Data e hora do agendamento
- `status`: Status (pending, confirmed, completed, cancelled)
- `created_at`: Data de criação

#### 3. **face_simulations**
Armazena histórico de simulações faciais.

```sql
CREATE TABLE face_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  style_name TEXT NOT NULL,
  style_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

**Campos:**
- `id`: ID único da simulação
- `user_id`: ID do usuário
- `style_name`: Nome do estilo recomendado
- `style_type`: Tipo/categoria do estilo
- `created_at`: Data da simulação

### Políticas de Segurança (RLS)

Todas as tabelas possuem **Row Level Security (RLS)** habilitado:

- **profiles**: Públicas para leitura, usuários podem atualizar seu próprio perfil
- **appointments**: Usuários veem apenas seus agendamentos
- **face_simulations**: Usuários veem apenas suas simulações

---

## 🔑 Credenciais de Integração

### Chaves de API Supabase:

```javascript
const SUPABASE_URL = 'https://jhfwgucoaykbgoyqibdn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WCFJ3pqXM30no8I7rxsmFg_eXMQBdH0';
```

**Nota**: A chave `sb_publishable_*` é segura para usar no frontend (cliente-side).

---

## 📦 Arquivo: `supabase-client.js`

Cliente JavaScript para interagir com o Supabase.

### Métodos Disponíveis:

#### 1. **saveFaceSimulation(styleName, styleType, faceData)**
Salva uma simulação facial no banco de dados.

```javascript
await supabaseClient.saveFaceSimulation(
  'Executive Contour',
  'Clássico social',
  { source: 'photo-upload', timestamp: new Date().toISOString() }
);
```

#### 2. **saveAppointment(service, barber, appointmentDate)**
Salva um agendamento.

```javascript
await supabaseClient.saveAppointment(
  'Corte Completo',
  'João',
  new Date('2026-06-20T14:00:00')
);
```

#### 3. **getFaceSimulations()**
Obtém histórico de simulações do usuário.

```javascript
const simulations = await supabaseClient.getFaceSimulations();
```

#### 4. **getAppointments()**
Obtém agendamentos do usuário.

```javascript
const appointments = await supabaseClient.getAppointments();
```

#### 5. **updateProfile(fullName, avatarUrl)**
Atualiza perfil do usuário.

```javascript
await supabaseClient.updateProfile('João Silva', 'https://...');
```

#### 6. **query(table, options)**
Executa queries customizadas.

```javascript
const results = await supabaseClient.query('appointments', {
  select: '*',
  filter: 'status=eq.pending',
  limit: 10
});
```

---

## 🔗 Integração nos Arquivos Existentes

### `script.js` (Atualizado)

- Adicionadas constantes de Supabase
- Integração com `supabaseClient.saveFaceSimulation()` ao selecionar estilo
- Carregamento automático do `supabase-client.js`

### `ia-tryon.html` (Sem alterações)

Continua funcionando normalmente. As simulações são salvas automaticamente via `script.js`.

---

## 🚀 Próximos Passos Recomendados

### 1. **Autenticação de Usuários**
```javascript
// Implementar login/signup com Supabase Auth
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password'
});
```

### 2. **Histórico de Simulações**
Criar página para visualizar simulações anteriores do usuário.

### 3. **Agendamentos Online**
Integrar sistema de agendamento direto no site (sem WhatsApp).

### 4. **Análise de Dados**
Dashboard para barbeiro visualizar:
- Estilos mais solicitados
- Horários com mais demanda
- Análise de satisfação do cliente

### 5. **Notificações**
- Email/SMS de confirmação de agendamento
- Lembretes antes do agendamento

---

## 🛠️ Tecnologias Utilizadas

| Tecnologia | Propósito |
|-----------|----------|
| **Face-API.js** | Detecção facial em tempo real |
| **Supabase** | Backend e banco de dados |
| **PostgreSQL** | Banco de dados relacional |
| **JavaScript Vanilla** | Frontend sem dependências pesadas |
| **HTML5 Canvas** | Renderização de detecções |
| **getUserMedia API** | Acesso à câmera |

---

## 📱 Compatibilidade

- ✅ Chrome/Edge (Desktop e Mobile)
- ✅ Firefox (Desktop e Mobile)
- ✅ Safari (iOS 14.5+)
- ⚠️ Requer HTTPS (exceto localhost)
- ⚠️ Requer permissão de câmera

---

## 🔒 Segurança

- Chaves de API do Supabase são públicas (por design)
- RLS (Row Level Security) protege dados de usuários
- Dados de simulação são associados ao usuário autenticado
- Recomendado implementar autenticação antes de produção

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Verificar console do navegador (F12)
2. Consultar documentação do Face-API: https://github.com/vladmandic/face-api
3. Consultar documentação do Supabase: https://supabase.com/docs

---

**Última atualização**: 16 de junho de 2026
**Versão**: 1.0
