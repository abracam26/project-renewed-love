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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
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
