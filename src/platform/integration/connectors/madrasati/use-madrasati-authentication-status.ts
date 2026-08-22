import { useQuery } from "@tanstack/react-query";

import { getMadrasatiAuthenticationStatus } from "./madrasati.functions";

export function useMadrasatiAuthenticationStatus() {
  return useQuery({
    queryKey: ["madrasati", "authentication-status"],
    queryFn: () => getMadrasatiAuthenticationStatus(),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}
