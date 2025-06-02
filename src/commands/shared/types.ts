/**
 * Represents a user in the org.
 */
export interface OrgUser {
    Username: string;
    Name: string;
    Id: string;
    IsFrozen: boolean;
    IsActive: boolean;
}

/**
 * Represents a query result from the CLI.
 */
export interface QueryResult<T> {
    result: {
        records: T[];
    }
    totalSize: number;
    done: boolean;
    status: number;
}

/**
 * Represents a user login in the org.
 */
export interface UserLogin {
    Id: string;
    UserId: string;
    IsFrozen: boolean;
}