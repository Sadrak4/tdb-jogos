-- TDB 8.1.4 • migração ADITIVA para performance e integridade
-- Executar no Supabase SQL Editor (staging/backup antes da publicação).
-- NÃO apaga contas, salas, músicas, partidas nem resultados anteriores.
BEGIN;

-- O servidor grava uma jogada apenas quando a versão atual ainda é a mesma.
-- A atualização é uma instrução SQL atômica, válida entre múltiplas instâncias Vercel.
CREATE OR REPLACE FUNCTION public.tdb_cas_game_state(
  p_key text, p_expected_version bigint, p_value jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_key IS NULL OR left(p_key,5)<>'game:' OR p_expected_version IS NULL
    OR p_value IS NULL OR (p_value->>'version') IS NULL THEN
    RAISE EXCEPTION 'CAS: argumentos inválidos';
  END IF;
  UPDATE public.tdb_shared
    SET value=p_value,updated_at=clock_timestamp()
    WHERE key=p_key
      AND COALESCE((value->>'version')::bigint,0)=p_expected_version
      AND (p_value->>'version')::bigint>p_expected_version;
  RETURN FOUND;
END;
$$;

-- Rate limiting atômico em uma única consulta; fallback legado permanece no código.
CREATE OR REPLACE FUNCTION public.tdb_rate_consume(
  p_key text,p_window_ms integer,p_limit integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_now timestamptz:=clock_timestamp(); v_count integer; v_start timestamptz;
BEGIN
  IF p_key IS NULL OR length(p_key)>180 OR p_window_ms<1000 OR p_window_ms>86400000
     OR p_limit<1 OR p_limit>10000 THEN RAISE EXCEPTION 'Rate limit: argumentos inválidos'; END IF;
  INSERT INTO public.tdb_rate_limits AS rl(key,window_started_at,count,updated_at)
  VALUES(p_key,v_now,1,v_now)
  ON CONFLICT(key) DO UPDATE
  SET count=CASE WHEN rl.window_started_at + p_window_ms*interval '1 millisecond'<=v_now
                 THEN 1 ELSE rl.count+1 END,
      window_started_at=CASE WHEN rl.window_started_at + p_window_ms*interval '1 millisecond'<=v_now
                 THEN v_now ELSE rl.window_started_at END,
      updated_at=v_now
  RETURNING count,window_started_at INTO v_count,v_start;
  RETURN jsonb_build_object('allowed',v_count<=p_limit,
    'retry_after_ms',CASE WHEN v_count<=p_limit THEN 0 ELSE greatest(1000,
      ceil(extract(epoch FROM (v_start+p_window_ms*interval '1 millisecond'-v_now))*1000)::integer) END);
END;
$$;

-- Totais completos: os 20 resultados recentes são consultados separadamente.
CREATE OR REPLACE FUNCTION public.tdb_profile_history_stats(p_user_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT COALESCE(jsonb_object_agg(game,jsonb_build_object(
     'played',played,'wins',wins,'losses',losses,'draws',draws,'canceled',canceled
  )), '{}'::jsonb)
  FROM (
    SELECT game,count(*)::integer AS played,
      count(*) FILTER(WHERE p_user_id=ANY(winner_ids))::integer AS wins,
      count(*) FILTER(WHERE p_user_id=ANY(loser_ids))::integer AS losses,
      count(*) FILTER(WHERE result_type='canceled')::integer AS canceled,
      count(*) FILTER(WHERE result_type<>'canceled'
        AND p_user_id<>ALL(winner_ids)
        AND p_user_id<>ALL(loser_ids))::integer AS draws
    FROM public.tdb_game_results
    WHERE p_user_id=ANY(participant_ids)
    GROUP BY game
  ) totals;
$$;

REVOKE ALL ON FUNCTION public.tdb_cas_game_state(text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tdb_rate_consume(text,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tdb_profile_history_stats(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tdb_cas_game_state(text,bigint,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.tdb_rate_consume(text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.tdb_profile_history_stats(text) TO service_role;
COMMIT;
