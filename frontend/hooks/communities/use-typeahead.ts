import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { isRateLimitError, searchTypeahead, type TypeaheadResult, type TypeaheadScope } from "@/lib/community-search";

function useDebouncedValue<T>(value: T, delay = 200) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}

export function useTypeahead(scope: TypeaheadScope, query: string) {
  const debounced = useDebouncedValue(query);
  const enabled = debounced.trim().length >= 2;

  const result = useQuery<{ hits: TypeaheadResult[] }>({
    queryKey: ["typeahead", scope, debounced],
    enabled,
    staleTime: 5_000,
    queryFn: ({ signal }) => searchTypeahead({ q: debounced.trim(), scope, signal }),
  });

  return useMemo(
    () => ({
      ...result,
      suggestions: result.data?.hits ?? [],
      isRateLimited: isRateLimitError(result.error),
      retryAfter: isRateLimitError(result.error) ? result.error.retryAfter : undefined,
    }),
    [result],
  );
}
