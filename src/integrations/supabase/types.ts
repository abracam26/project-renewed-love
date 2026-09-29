export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      chamados_suporte: {
        Row: {
          categoria: string
          created_at: string
          id: string
          mensagem: string
          respondido_em: string | null
          respondido_por: string | null
          resposta: string | null
          status: string
          titulo: string
          user_id: string
        }
        Insert: {
          categoria: string
          created_at?: string
          id?: string
          mensagem: string
          respondido_em?: string | null
          respondido_por?: string | null
          resposta?: string | null
          status?: string
          titulo: string
          user_id: string
        }
        Update: {
          categoria?: string
          created_at?: string
          id?: string
          mensagem?: string
          respondido_em?: string | null
          respondido_por?: string | null
          resposta?: string | null
          status?: string
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          cpf_cnpj: string
          created_at: string
          email: string | null
          external_customer_id: string | null
          gateway: string
          id: string
          nome: string
          telefone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cpf_cnpj: string
          created_at?: string
          email?: string | null
          external_customer_id?: string | null
          gateway?: string
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cpf_cnpj?: string
          created_at?: string
          email?: string | null
          external_customer_id?: string | null
          gateway?: string
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      configuracoes: {
        Row: {
          chave: string
          updated_at: string
          updated_by: string | null
          valor: string
        }
        Insert: {
          chave: string
          updated_at?: string
          updated_by?: string | null
          valor: string
        }
        Update: {
          chave?: string
          updated_at?: string
          updated_by?: string | null
          valor?: string
        }
        Relationships: []
      }
      configuracoes_prova: {
        Row: {
          mostrar_explicacao: boolean
          nota_corte: number
          pct_dificil: number
          pct_facil: number
          pct_media: number
          pct_tema_1: number
          pct_tema_2: number
          pct_tema_3: number
          pct_tema_4: number
          tempo_maximo_min: number
          tipo: string
          total_questoes: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          mostrar_explicacao?: boolean
          nota_corte: number
          pct_dificil: number
          pct_facil: number
          pct_media: number
          pct_tema_1: number
          pct_tema_2: number
          pct_tema_3: number
          pct_tema_4: number
          tempo_maximo_min: number
          tipo: string
          total_questoes: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          mostrar_explicacao?: boolean
          nota_corte?: number
          pct_dificil?: number
          pct_facil?: number
          pct_media?: number
          pct_tema_1?: number
          pct_tema_2?: number
          pct_tema_3?: number
          pct_tema_4?: number
          tempo_maximo_min?: number
          tipo?: string
          total_questoes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      geracoes_ia: {
        Row: {
          created_at: string
          descartadas: number
          dificuldade: string | null
          duracao_ms: number | null
          erros: Json
          exame: string
          geradas: number
          id: string
          instrucao_extra: string | null
          modelo: string
          nivel: string
          quantidade: number
          tema: number
          tokens_entrada: number | null
          tokens_saida: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          descartadas?: number
          dificuldade?: string | null
          duracao_ms?: number | null
          erros?: Json
          exame?: string
          geradas?: number
          id?: string
          instrucao_extra?: string | null
          modelo: string
          nivel: string
          quantidade: number
          tema: number
          tokens_entrada?: number | null
          tokens_saida?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          descartadas?: number
          dificuldade?: string | null
          duracao_ms?: number | null
          erros?: Json
          exame?: string
          geradas?: number
          id?: string
          instrucao_extra?: string | null
          modelo?: string
          nivel?: string
          quantidade?: number
          tema?: number
          tokens_entrada?: number | null
          tokens_saida?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      gratuidade_usada: {
        Row: {
          cpf_hash: string
          usada_em: string
        }
        Insert: {
          cpf_hash: string
          usada_em?: string
        }
        Update: {
          cpf_hash?: string
          usada_em?: string
        }
        Relationships: []
      }
      historico_acesso: {
        Row: {
          created_at: string
          feito_por: string | null
          id: string
          observacao: string | null
          origem: string
          pedido_id: string | null
          plano_antes: string | null
          plano_depois: string | null
          user_id: string
          validade_antes: string | null
          validade_depois: string | null
        }
        Insert: {
          created_at?: string
          feito_por?: string | null
          id?: string
          observacao?: string | null
          origem: string
          pedido_id?: string | null
          plano_antes?: string | null
          plano_depois?: string | null
          user_id: string
          validade_antes?: string | null
          validade_depois?: string | null
        }
        Update: {
          created_at?: string
          feito_por?: string | null
          id?: string
          observacao?: string | null
          origem?: string
          pedido_id?: string | null
          plano_antes?: string | null
          plano_depois?: string | null
          user_id?: string
          validade_antes?: string | null
          validade_depois?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_acesso_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      importacoes: {
        Row: {
          arquivo: string
          created_at: string
          erros: Json
          formato: string
          id: string
          total_atualizadas: number
          total_erros: number
          total_inseridas: number
          total_lidas: number
          user_id: string | null
        }
        Insert: {
          arquivo: string
          created_at?: string
          erros?: Json
          formato: string
          id?: string
          total_atualizadas?: number
          total_erros?: number
          total_inseridas?: number
          total_lidas?: number
          user_id?: string | null
        }
        Update: {
          arquivo?: string
          created_at?: string
          erros?: Json
          formato?: string
          id?: string
          total_atualizadas?: number
          total_erros?: number
          total_inseridas?: number
          total_lidas?: number
          user_id?: string | null
        }
        Relationships: []
      }
      materiais: {
        Row: {
          arquivo_path: string
          ativo: boolean
          categoria: string
          created_at: string
          created_by: string | null
          descricao: string | null
          downloads: number
          id: string
          nome_arquivo: string
          ordem: number
          tamanho_bytes: number
          titulo: string
        }
        Insert: {
          arquivo_path: string
          ativo?: boolean
          categoria?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          downloads?: number
          id?: string
          nome_arquivo: string
          ordem?: number
          tamanho_bytes: number
          titulo: string
        }
        Update: {
          arquivo_path?: string
          ativo?: boolean
          categoria?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          downloads?: number
          id?: string
          nome_arquivo?: string
          ordem?: number
          tamanho_bytes?: number
          titulo?: string
        }
        Relationships: []
      }
      material_trechos: {
        Row: {
          conteudo: string
          created_at: string
          exame: string
          id: string
          ordem: number
          tema: number
          titulo: string
          updated_at: string
          versao: string
        }
        Insert: {
          conteudo: string
          created_at?: string
          exame?: string
          id?: string
          ordem?: number
          tema: number
          titulo: string
          updated_at?: string
          versao?: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          exame?: string
          id?: string
          ordem?: number
          tema?: number
          titulo?: string
          updated_at?: string
          versao?: string
        }
        Relationships: []
      }
      pagamentos: {
        Row: {
          created_at: string
          expira_em: string | null
          external_payment_id: string | null
          gateway: string
          id: string
          metadata: Json
          metodo_pagamento: string
          motivo_revisao: string | null
          paid_at: string | null
          parcelas: number
          pedido_id: string
          registrado_por: string | null
          requer_revisao: boolean
          revisao_resolvida_em: string | null
          revisao_resolvida_por: string | null
          status: string
          status_gateway: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          created_at?: string
          expira_em?: string | null
          external_payment_id?: string | null
          gateway: string
          id?: string
          metadata?: Json
          metodo_pagamento: string
          motivo_revisao?: string | null
          paid_at?: string | null
          parcelas?: number
          pedido_id: string
          registrado_por?: string | null
          requer_revisao?: boolean
          revisao_resolvida_em?: string | null
          revisao_resolvida_por?: string | null
          status?: string
          status_gateway?: string | null
          updated_at?: string
          valor: number
        }
        Update: {
          created_at?: string
          expira_em?: string | null
          external_payment_id?: string | null
          gateway?: string
          id?: string
          metadata?: Json
          metodo_pagamento?: string
          motivo_revisao?: string | null
          paid_at?: string | null
          parcelas?: number
          pedido_id?: string
          registrado_por?: string | null
          requer_revisao?: boolean
          revisao_resolvida_em?: string | null
          revisao_resolvida_por?: string | null
          status?: string
          status_gateway?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          acesso_removido: boolean | null
          cancelado_em: string | null
          cancelado_por: string | null
          chave_venda: string | null
          cliente_id: string
          codigo: string
          comprador_documento: string
          comprador_email: string | null
          comprador_nome: string
          comprador_tipo: string
          created_at: string
          criado_por: string | null
          dias_concedidos: number | null
          estornado_em: string | null
          estornado_por: string | null
          expira_em: string | null
          external_order_id: string | null
          gateway: string
          id: string
          liberado_em: string | null
          liberado_por: string | null
          metodo_pagamento: string | null
          motivo_cancelamento: string | null
          motivo_estorno: string | null
          origem: string
          plano_anterior: string | null
          plano_concedido: string | null
          plano_duracao_quantidade: number
          plano_duracao_unidade: string
          plano_id: string
          plano_nome: string
          plano_nome_anterior: string | null
          plano_tipo_acesso: string
          status: string
          teste: boolean
          updated_at: string
          user_id: string | null
          validade_anterior: string | null
          validade_concedida: string | null
          valor_total: number
        }
        Insert: {
          acesso_removido?: boolean | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          chave_venda?: string | null
          cliente_id: string
          codigo?: string
          comprador_documento: string
          comprador_email?: string | null
          comprador_nome: string
          comprador_tipo: string
          created_at?: string
          criado_por?: string | null
          dias_concedidos?: number | null
          estornado_em?: string | null
          estornado_por?: string | null
          expira_em?: string | null
          external_order_id?: string | null
          gateway?: string
          id?: string
          liberado_em?: string | null
          liberado_por?: string | null
          metodo_pagamento?: string | null
          motivo_cancelamento?: string | null
          motivo_estorno?: string | null
          origem?: string
          plano_anterior?: string | null
          plano_concedido?: string | null
          plano_duracao_quantidade: number
          plano_duracao_unidade: string
          plano_id: string
          plano_nome: string
          plano_nome_anterior?: string | null
          plano_tipo_acesso: string
          status?: string
          teste?: boolean
          updated_at?: string
          user_id?: string | null
          validade_anterior?: string | null
          validade_concedida?: string | null
          valor_total: number
        }
        Update: {
          acesso_removido?: boolean | null
          cancelado_em?: string | null
          cancelado_por?: string | null
          chave_venda?: string | null
          cliente_id?: string
          codigo?: string
          comprador_documento?: string
          comprador_email?: string | null
          comprador_nome?: string
          comprador_tipo?: string
          created_at?: string
          criado_por?: string | null
          dias_concedidos?: number | null
          estornado_em?: string | null
          estornado_por?: string | null
          expira_em?: string | null
          external_order_id?: string | null
          gateway?: string
          id?: string
          liberado_em?: string | null
          liberado_por?: string | null
          metodo_pagamento?: string | null
          motivo_cancelamento?: string | null
          motivo_estorno?: string | null
          origem?: string
          plano_anterior?: string | null
          plano_concedido?: string | null
          plano_duracao_quantidade?: number
          plano_duracao_unidade?: string
          plano_id?: string
          plano_nome?: string
          plano_nome_anterior?: string | null
          plano_tipo_acesso?: string
          status?: string
          teste?: boolean
          updated_at?: string
          user_id?: string | null
          validade_anterior?: string | null
          validade_concedida?: string | null
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          ativo: boolean
          beneficios: string[]
          created_at: string
          descricao: string
          destaque: boolean
          duracao_quantidade: number
          duracao_unidade: string
          formas_pagamento: string[]
          id: string
          nome: string
          ordem: number
          parcelas_max: number
          preco_centavos: number
          tipo_acesso: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          beneficios?: string[]
          created_at?: string
          descricao?: string
          destaque?: boolean
          duracao_quantidade: number
          duracao_unidade: string
          formas_pagamento?: string[]
          id?: string
          nome: string
          ordem?: number
          parcelas_max?: number
          preco_centavos?: number
          tipo_acesso: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          beneficios?: string[]
          created_at?: string
          descricao?: string
          destaque?: boolean
          duracao_quantidade?: number
          duracao_unidade?: string
          formas_pagamento?: string[]
          id?: string
          nome?: string
          ordem?: number
          parcelas_max?: number
          preco_centavos?: number
          tipo_acesso?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cadastro_completo_em: string | null
          cnpj: string | null
          cpf: string | null
          cpf_hash: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          instituicao: string | null
          nome_completo: string | null
          plano: string
          plano_nome: string | null
          plano_validade: string | null
          show_in_ranking: boolean
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          cadastro_completo_em?: string | null
          cnpj?: string | null
          cpf?: string | null
          cpf_hash?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          instituicao?: string | null
          nome_completo?: string | null
          plano?: string
          plano_nome?: string | null
          plano_validade?: string | null
          show_in_ranking?: boolean
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          cadastro_completo_em?: string | null
          cnpj?: string | null
          cpf?: string | null
          cpf_hash?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          instituicao?: string | null
          nome_completo?: string | null
          plano?: string
          plano_nome?: string | null
          plano_validade?: string | null
          show_in_ranking?: boolean
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      questoes: {
        Row: {
          alternativas: Json
          ativa: boolean
          created_at: string
          dificuldade: string
          enunciado: string
          exame: string
          explicacao: string | null
          fonte_artigo: string | null
          fonte_norma: string | null
          fonte_pagina: number | null
          gabarito: string
          geracao_id: string | null
          id: string
          importacao_id: string | null
          nivel: string
          origem: string
          status: string
          subtema: string | null
          tags: string[]
          tema: number
          tema_nome: string
          updated_at: string
          versao_material: string
        }
        Insert: {
          alternativas: Json
          ativa?: boolean
          created_at?: string
          dificuldade: string
          enunciado: string
          exame?: string
          explicacao?: string | null
          fonte_artigo?: string | null
          fonte_norma?: string | null
          fonte_pagina?: number | null
          gabarito: string
          geracao_id?: string | null
          id: string
          importacao_id?: string | null
          nivel: string
          origem?: string
          status?: string
          subtema?: string | null
          tags?: string[]
          tema: number
          tema_nome: string
          updated_at?: string
          versao_material?: string
        }
        Update: {
          alternativas?: Json
          ativa?: boolean
          created_at?: string
          dificuldade?: string
          enunciado?: string
          exame?: string
          explicacao?: string | null
          fonte_artigo?: string | null
          fonte_norma?: string | null
          fonte_pagina?: number | null
          gabarito?: string
          geracao_id?: string | null
          id?: string
          importacao_id?: string | null
          nivel?: string
          origem?: string
          status?: string
          subtema?: string | null
          tags?: string[]
          tema?: number
          tema_nome?: string
          updated_at?: string
          versao_material?: string
        }
        Relationships: [
          {
            foreignKeyName: "questoes_geracao_id_fkey"
            columns: ["geracao_id"]
            isOneToOne: false
            referencedRelation: "geracoes_ia"
            referencedColumns: ["id"]
          },
        ]
      }
      reportes_questao: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          motivo: string
          questao_id: string
          resolvido_em: string | null
          resolvido_por: string | null
          resposta_admin: string | null
          simulado_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          motivo: string
          questao_id: string
          resolvido_em?: string | null
          resolvido_por?: string | null
          resposta_admin?: string | null
          simulado_id?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          motivo?: string
          questao_id?: string
          resolvido_em?: string | null
          resolvido_por?: string | null
          resposta_admin?: string | null
          simulado_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reportes_questao_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "questoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportes_questao_simulado_id_fkey"
            columns: ["simulado_id"]
            isOneToOne: false
            referencedRelation: "simulados"
            referencedColumns: ["id"]
          },
        ]
      }
      simulado_questoes: {
        Row: {
          correta: boolean | null
          id: string
          ordem: number
          ordem_letras: string
          questao_id: string
          respondida_em: string | null
          resposta: string | null
          simulado_id: string
          tempo_ms: number | null
        }
        Insert: {
          correta?: boolean | null
          id?: string
          ordem: number
          ordem_letras: string
          questao_id: string
          respondida_em?: string | null
          resposta?: string | null
          simulado_id: string
          tempo_ms?: number | null
        }
        Update: {
          correta?: boolean | null
          id?: string
          ordem?: number
          ordem_letras?: string
          questao_id?: string
          respondida_em?: string | null
          resposta?: string | null
          simulado_id?: string
          tempo_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "simulado_questoes_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "questoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulado_questoes_simulado_id_fkey"
            columns: ["simulado_id"]
            isOneToOne: false
            referencedRelation: "simulados"
            referencedColumns: ["id"]
          },
        ]
      }
      simulados: {
        Row: {
          acertos: number | null
          aprovado: boolean | null
          duracao_segundos: number | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          nota_corte: number
          sessao_prova: string | null
          status: string
          tempo_maximo_min: number
          tipo: string
          total_questoes: number
          user_id: string
        }
        Insert: {
          acertos?: number | null
          aprovado?: boolean | null
          duracao_segundos?: number | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          nota_corte: number
          sessao_prova?: string | null
          status?: string
          tempo_maximo_min: number
          tipo: string
          total_questoes: number
          user_id: string
        }
        Update: {
          acertos?: number | null
          aprovado?: boolean | null
          duracao_segundos?: number | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          nota_corte?: number
          sessao_prova?: string | null
          status?: string
          tempo_maximo_min?: number
          tipo?: string
          total_questoes?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulados_tipo_fkey"
            columns: ["tipo"]
            isOneToOne: false
            referencedRelation: "configuracoes_prova"
            referencedColumns: ["tipo"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_definir_plano: {
        Args: {
          p_plano: string
          p_plano_esperado?: string
          p_por: string
          p_user: string
          p_validade?: string
          p_validade_esperada?: string
        }
        Returns: Json
      }
      admin_listar_usuarios: {
        Args: {
          p_busca?: string
          p_filtro?: string
          p_limite?: number
          p_offset?: number
        }
        Returns: {
          acesso_ativo: boolean
          cadastro_completo: boolean
          cnpj: string
          cpf: string
          criado_em: string
          email: string
          instituicao: string
          is_admin: boolean
          nome: string
          plano: string
          plano_validade: string
          provedor: string
          simulados: number
          total: number
          ultimo_acesso: string
          user_id: string
        }[]
      }
      apagar_pedidos_nao_pagos: { Args: { p_user: string }; Returns: number }
      calcular_nova_validade: {
        Args: {
          p_hoje?: string
          p_plano_atual: string
          p_quantidade: number
          p_unidade: string
          p_validade_atual: string
        }
        Returns: string
      }
      cancelar_pedido: {
        Args: {
          p_dono?: string
          p_motivo?: string
          p_pedido: string
          p_por: string
        }
        Returns: Json
      }
      contar_questoes_por_exame_tema: {
        Args: never
        Returns: {
          ativas: number
          exame: string
          tema: number
          total: number
        }[]
      }
      contar_questoes_por_tema: {
        Args: never
        Returns: {
          ativas: number
          tema: number
          total: number
        }[]
      }
      criar_pedido: {
        Args: {
          p_chave?: string
          p_comprador_tipo?: string
          p_manter_esperado?: boolean
          p_metodo: string
          p_origem?: string
          p_pendente_esperado?: string
          p_plano: string
          p_por?: string
          p_prazo_dias?: number
          p_user: string
          p_valor?: number
        }
        Returns: Json
      }
      desempenho_aluno: {
        Args: { p_user_id: string }
        Returns: {
          acertos: number
          chave: string
          dimensao: string
          total: number
        }[]
      }
      estatisticas_aluno: {
        Args: { p_user_id: string }
        Returns: {
          aprovados: number
          media_pct: number
          melhor_pct: number
          simulados_completos: number
          tempo_total_seg: number
          total_questoes: number
          total_simulados: number
        }[]
      }
      estornar_pedido: {
        Args: {
          p_motivo: string
          p_pedido: string
          p_por: string
          p_remover_acesso: boolean
        }
        Returns: Json
      }
      expirar_pedidos_vencidos: { Args: { p_user?: string }; Returns: number }
      expurgar_pedidos_antigos: { Args: { p_antes: string }; Returns: number }
      gerar_codigo_pedido: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hoje_sao_paulo: { Args: never; Returns: string }
      ranking_alunos: {
        Args: { p_dias?: number }
        Returns: {
          media_pct: number
          melhor_pct: number
          nome: string
          posicao: number
          simulados: number
          user_id: string
        }[]
      }
      registrar_pagamento_pedido: {
        Args: {
          p_aceitar_valor_diferente?: boolean
          p_external_payment_id?: string
          p_gateway: string
          p_metadata?: Json
          p_metodo: string
          p_origem: string
          p_pagamento_id?: string
          p_pago_em?: string
          p_parcelas?: number
          p_pedido: string
          p_por?: string
          p_valor: number
        }
        Returns: Json
      }
      registrar_venda_admin: {
        Args: {
          p_aceitar_valor_diferente?: boolean
          p_chave: string
          p_comprador_tipo?: string
          p_metadata?: Json
          p_metodo: string
          p_pago_em?: string
          p_pendente_esperado?: string
          p_plano: string
          p_por: string
          p_user: string
          p_valor: number
        }
        Returns: Json
      }
      resolver_revisao_pagamento: {
        Args: {
          p_devolvido?: boolean
          p_observacao: string
          p_pagamento: string
          p_por: string
        }
        Returns: Json
      }
      sortear_questoes_simulado: {
        Args: { p_tipo: string; p_user_id: string }
        Returns: {
          ordem: number
          questao_id: string
          tema: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
