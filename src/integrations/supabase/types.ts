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
      geracoes_ia: {
        Row: {
          created_at: string
          descartadas: number
          dificuldade: string | null
          duracao_ms: number | null
          erros: Json
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
      material_trechos: {
        Row: {
          conteudo: string
          created_at: string
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
          created_at: string
          full_name: string | null
          id: string
          show_in_ranking: boolean
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          show_in_ranking?: boolean
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
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
        Relationships: []
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
      contar_questoes_por_tema: {
        Args: never
        Returns: {
          ativas: number
          tema: number
          total: number
        }[]
      }
      gerar_simulado: {
        Args: { p_nivel?: string; p_total?: number }
        Returns: {
          alternativas: Json
          ativa: boolean
          created_at: string
          dificuldade: string
          enunciado: string
          explicacao: string | null
          fonte_artigo: string | null
          fonte_norma: string | null
          fonte_pagina: number | null
          gabarito: string
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
        }[]
        SetofOptions: {
          from: "*"
          to: "questoes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
