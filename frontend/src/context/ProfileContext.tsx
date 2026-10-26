
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import api from "../services/api";
import { useAuth } from "./AuthContext";

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

export interface DietaryPreferences {
  diet: string | null;
  restrictions: string[];
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

  // Current dietary preferences for the selected person
  dietaryPreferences: DietaryPreferences;

  // Whether the selected person has unsaved preferences
  hasDietaryOverrides: boolean;

  // Update the selected person's draft preferences
  setDietaryPreferences: (
    preferences: DietaryPreferences
  ) => void;

  // Restore the selected person's ontology preferences
  resetDietaryPreferences: () => void;

  loading: boolean;
  error: string | null;
  refreshProfile: () => void;
}

const ProfileContext =
  createContext<ProfileContextValue | null>(null);

// ============================================================
// HELPERS
// ============================================================

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function normalizePreferences(
  preferences: DietaryPreferences
): DietaryPreferences {
  return {
    diet: preferences.diet || null,
    restrictions: uniqueSorted(preferences.restrictions),
  };
}

function preferencesEqual(
  first: DietaryPreferences,
  second: DietaryPreferences
): boolean {
  const a = normalizePreferences(first);
  const b = normalizePreferences(second);

  return (
    a.diet === b.diet &&
    a.restrictions.length === b.restrictions.length &&
    a.restrictions.every(
      (restriction, index) =>
        restriction === b.restrictions[index]
    )
  );
}

function getOntologyPreferences(
  relationships: ProfileRelationship[],
  personName: string
): DietaryPreferences {
  const personRelationships = relationships.filter(
    (relationship) =>
      relationship.person === personName
  );

  const dietRelationship = personRelationships.find(
    (relationship) =>
      relationship.property === "suitRegime"
  );

  const restrictionRelationships =
    personRelationships.filter(
      (relationship) =>
        relationship.property === "aRestriction"
    );

  return normalizePreferences({
    diet: dietRelationship?.value ?? null,
    restrictions: restrictionRelationships.map(
      (relationship) => relationship.value
    ),
  });
}

// ============================================================
// PROVIDER
// ============================================================

export function ProfileProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useAuth();
  const [persons, setPersons] = useState<ProfilePerson[]>(
    []
  );

  const [selectedPerson, setSelectedPerson] = useState("");

  const [relationships, setRelationships] = useState<
    ProfileRelationship[]
  >([]);

  // Draft preferences are stored separately for each person.
  // Example:
  // {
  //   Utilisateur1: { diet: "RegimeVegan1", restrictions: [] },
  //   Utilisateur2: { diet: "RegimeVegetarien1", restrictions: [...] }
  // }
  const [dietaryOverrides, setDietaryOverrides] =
    useState<Record<string, DietaryPreferences>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // ============================================================
  // LOAD PROFILE DATA
  // ============================================================

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);
      setError(null);

      try {
        const [
          optionsResponse,
          relationshipsResponse,
        ] = await Promise.all([
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
          throw new Error(
            "Invalid profile API response"
          );
        }

        setPersons(nextPersons);
        setRelationships(nextRelationships);

        setSelectedPerson((previous) => {
          if (user?.role === "client" && user.person) {
            return nextPersons.some(
              (person) => person.name === user.person
            )
              ? user.person
              : previous;
          }

          const exists = nextPersons.some(
            (person) => person.name === previous
          );

          return exists
            ? previous
            : nextPersons[0]?.name ?? "";
        });

        // Remove drafts for people no longer present.
        // Keep existing drafts for valid people.
        setDietaryOverrides((previous) => {
          const validNames = new Set(
            nextPersons.map((person) => person.name)
          );

          return Object.fromEntries(
            Object.entries(previous).filter(
              ([personName]) =>
                validNames.has(personName)
            )
          );
        });
      } catch (err) {
        if (!active) return;

        console.error(
          "Failed to load profile data:",
          err
        );

        setError(
          "Unable to load user profiles from FastAPI and Fuseki."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [reloadKey, user]);

  // ============================================================
  // SELECTED PERSON RELATIONSHIPS
  // ============================================================

  const selectedRelationships = useMemo(
    () =>
      relationships.filter(
        (relationship) =>
          relationship.person === selectedPerson
      ),
    [relationships, selectedPerson]
  );

  // ============================================================
  // ONTOLOGY DIETARY PREFERENCES
  // ============================================================

  const ontologyPreferences = useMemo(
    () =>
      getOntologyPreferences(
        relationships,
        selectedPerson
      ),
    [relationships, selectedPerson]
  );

  // ============================================================
  // EFFECTIVE DIETARY PREFERENCES
  // ============================================================

  const dietaryPreferences = useMemo(() => {
    if (!selectedPerson) {
      return {
        diet: null,
        restrictions: [],
      };
    }

    return (
      dietaryOverrides[selectedPerson] ??
      ontologyPreferences
    );
  }, [
    dietaryOverrides,
    selectedPerson,
    ontologyPreferences,
  ]);

  const hasDietaryOverrides = useMemo(() => {
    if (!selectedPerson) {
      return false;
    }

    return !preferencesEqual(
      dietaryPreferences,
      ontologyPreferences
    );
  }, [
    selectedPerson,
    dietaryPreferences,
    ontologyPreferences,
  ]);

  // ============================================================
  // UPDATE DIETARY PREFERENCES
  // ============================================================

  const setDietaryPreferences = useCallback(
    (preferences: DietaryPreferences) => {
      if (!selectedPerson) {
        return;
      }

      const normalized =
        normalizePreferences(preferences);

      setDietaryOverrides((previous) => {
        // Avoid storing an unnecessary override when
        // the user selects the ontology's original values.
        if (
          preferencesEqual(
            normalized,
            ontologyPreferences
          )
        ) {
          if (!(selectedPerson in previous)) {
            return previous;
          }

          const next = { ...previous };
          delete next[selectedPerson];

          return next;
        }

        return {
          ...previous,
          [selectedPerson]: normalized,
        };
      });
    },
    [selectedPerson, ontologyPreferences]
  );

  // ============================================================
  // RESTORE ONTOLOGY PREFERENCES
  // ============================================================

  const resetDietaryPreferences = useCallback(() => {
    if (!selectedPerson) {
      return;
    }

    setDietaryOverrides((previous) => {
      if (!(selectedPerson in previous)) {
        return previous;
      }

      const next = { ...previous };
      delete next[selectedPerson];

      return next;
    });
  }, [selectedPerson]);

  // ============================================================
  // REFRESH PROFILE
  // ============================================================

  const refreshProfile = useCallback(() => {
    setReloadKey((value) => value + 1);
  }, []);

  // ============================================================
  // CONTEXT VALUE
  // ============================================================

  const value = useMemo<ProfileContextValue>(
    () => ({
      persons,
      selectedPerson,
      setSelectedPerson,

      relationships,
      selectedRelationships,

      dietaryPreferences,
      hasDietaryOverrides,
      setDietaryPreferences,
      resetDietaryPreferences,

      loading,
      error,
      refreshProfile,
    }),
    [
      persons,
      selectedPerson,
      relationships,
      selectedRelationships,
      dietaryPreferences,
      hasDietaryOverrides,
      setDietaryPreferences,
      resetDietaryPreferences,
      loading,
      error,
      refreshProfile,
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
