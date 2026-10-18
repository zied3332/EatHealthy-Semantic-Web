
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import api from "../services/api";

// ============================================================
// TYPES
// ============================================================

export interface ProfilePerson {
  uri: string;
  name: string;
  type: string;
}

export interface ProfileRelationship {
  person: string;
  person_uri: string;
  property: string;
  property_uri: string;
  value: string;
  value_uri: string | null;
  value_type: string;
}

interface ProfileOptionsResponse {
  persons: ProfilePerson[];
}

interface ProfileRelationshipsResponse {
  relationships: ProfileRelationship[];
}

interface ProfileContextValue {
  persons: ProfilePerson[];
  selectedPerson: string;
  setSelectedPerson: (name: string) => void;
  relationships: ProfileRelationship[];
  selectedRelationships: ProfileRelationship[];
  loading: boolean;
  error: string | null;
  refreshProfile: () => void;
}

const ProfileContext =
  createContext<ProfileContextValue | null>(null);

// ============================================================
// PROVIDER
// ============================================================

export function ProfileProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [persons, setPersons] = useState<ProfilePerson[]>([]);
  const [selectedPerson, setSelectedPerson] = useState("");
  const [relationships, setRelationships] = useState<
    ProfileRelationship[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);
      setError(null);

      try {
        const [optionsResponse, relationshipsResponse] =
          await Promise.all([
            api.get<ProfileOptionsResponse>(
              "/api/profile/options"
            ),
            api.get<ProfileRelationshipsResponse>(
              "/api/profile/relationships"
            ),
          ]);

        if (!active) return;

        const nextPersons = optionsResponse.data.persons;
        const nextRelationships =
          relationshipsResponse.data.relationships;

        if (
          !Array.isArray(nextPersons) ||
          !Array.isArray(nextRelationships)
        ) {
          throw new Error("Invalid profile API response");
        }

        setPersons(nextPersons);
        setRelationships(nextRelationships);

        setSelectedPerson((previous) => {
          const exists = nextPersons.some(
            (person) => person.name === previous
          );

          return exists
            ? previous
            : nextPersons[0]?.name ?? "";
        });
      } catch (err) {
        if (!active) return;

        console.error("Failed to load profile data:", err);

        setError(
          "Unable to load user profiles from FastAPI and Fuseki."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const selectedRelationships = useMemo(
    () =>
      relationships.filter(
        (relationship) =>
          relationship.person === selectedPerson
      ),
    [relationships, selectedPerson]
  );

  function refreshProfile() {
    setReloadKey((value) => value + 1);
  }

  const value = useMemo<ProfileContextValue>(
    () => ({
      persons,
      selectedPerson,
      setSelectedPerson,
      relationships,
      selectedRelationships,
      loading,
      error,
      refreshProfile,
    }),
    [
      persons,
      selectedPerson,
      relationships,
      selectedRelationships,
      loading,
      error,
    ]
  );

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

// ============================================================
// HOOK
// ============================================================

export function useProfile() {
  const context = useContext(ProfileContext);

  if (!context) {
    throw new Error(
      "useProfile must be used inside ProfileProvider"
    );
  }

  return context;
}
