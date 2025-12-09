import assert from 'node:assert';
import { describe, it } from 'node:test';

import { areMapsEqual, getRecordValue, getTypedEntries, getTypedKeys } from './object';

describe( 'getRecordValue', () => {
	it( 'should return the value when object has the key', () => {
		const obj = { name: 'John', age: 30 };
		const result = getRecordValue< typeof obj, 'name' >( obj, 'name' );
		assert.strictEqual( result, 'John' );
	} );

	it( 'should return the value for numeric properties', () => {
		const obj = { count: 42, score: 100 };
		const result = getRecordValue< typeof obj, 'count' >( obj, 'count' );
		assert.strictEqual( result, 42 );
	} );

	it( 'should return the value for boolean properties', () => {
		const obj = { isActive: true, isDeleted: false };
		const result = getRecordValue< typeof obj, 'isActive' >( obj, 'isActive' );
		assert.strictEqual( result, true );
	} );

	it( 'should return the value for nested object properties', () => {
		const obj = { user: { name: 'Jane', email: 'jane@example.com' } };
		const result = getRecordValue< typeof obj, 'user' >( obj, 'user' );
		assert.deepStrictEqual( result, { name: 'Jane', email: 'jane@example.com' } );
	} );

	it( 'should return the value for array properties', () => {
		const obj = { items: [ 1, 2, 3 ], tags: [ 'a', 'b' ] };
		const result = getRecordValue< typeof obj, 'items' >( obj, 'items' );
		assert.deepStrictEqual( result, [ 1, 2, 3 ] );
	} );

	it( 'should return null when object is null', () => {
		const result = getRecordValue< { name: string }, 'name' >( null, 'name' );
		assert.strictEqual( result, null );
	} );

	it( 'should return null when object is undefined', () => {
		const result = getRecordValue< { name: string }, 'name' >( undefined, 'name' );
		assert.strictEqual( result, null );
	} );

	it( 'should return null when object is a string', () => {
		const result = getRecordValue< { name: string }, 'name' >( 'test', 'name' );
		assert.strictEqual( result, null );
	} );

	it( 'should return null when object is a number', () => {
		const result = getRecordValue< { name: string }, 'name' >( 42, 'name' );
		assert.strictEqual( result, null );
	} );

	it( 'should return null when object is a boolean', () => {
		const result = getRecordValue< { name: string }, 'name' >( true, 'name' );
		assert.strictEqual( result, null );
	} );

	it( 'should return null when object does not have the key', () => {
		const obj = { name: 'John' };
		const result = getRecordValue< { name: string; age: number }, 'age' >( obj, 'age' );
		assert.strictEqual( result, null );
	} );

	it( 'should return null for properties with value 0', () => {
		const obj = { count: 0 };
		const result = getRecordValue< typeof obj, 'count' >( obj, 'count' );
		assert.strictEqual( result, 0 );
	} );

	it( 'should return empty string when property value is empty string', () => {
		const obj = { name: '' };
		const result = getRecordValue< typeof obj, 'name' >( obj, 'name' );
		assert.strictEqual( result, '' );
	} );

	it( 'should return false when property value is false', () => {
		const obj = { isActive: false };
		const result = getRecordValue< typeof obj, 'isActive' >( obj, 'isActive' );
		assert.strictEqual( result, false );
	} );

	it( 'should return null when property value is explicitly null', () => {
		const obj = { data: null };
		const result = getRecordValue< typeof obj, 'data' >( obj, 'data' );
		assert.strictEqual( result, null );
	} );

	it( 'should return undefined when property value is explicitly undefined', () => {
		const obj = { data: undefined };
		const result = getRecordValue< typeof obj, 'data' >( obj, 'data' );
		assert.strictEqual( result, undefined );
	} );

	it( 'should work with objects created from Object.create', () => {
		const proto = { inherited: 'value' };
		const obj = Object.create( proto ) as { inherited: string; own: string };
		obj.own = 'ownValue';
		const result = getRecordValue< typeof obj, 'own' >( obj, 'own' );
		assert.strictEqual( result, 'ownValue' );
	} );

	it( 'should work with symbol keys when object has them', () => {
		const sym = Symbol( 'test' );
		const obj = { [ sym ]: 'symbolValue' };
		const result = getRecordValue< typeof obj, typeof sym >( obj, sym );
		assert.strictEqual( result, 'symbolValue' );
	} );
} );

describe( 'getTypedEntries', () => {
	describe( 'comparison with Object.entries', () => {
		it( 'should return the same entries as Object.entries', () => {
			const obj = { foo: 1, bar: 2, baz: 3 };
			const typedKeys = getTypedEntries( obj );
			const objectKeys = Object.entries( obj );
			assert.deepStrictEqual( typedKeys, objectKeys );
		} );
	} );
} );

describe( 'getTypedKeys', () => {
	describe( 'comparison with Object.keys', () => {
		it( 'should return the same keys as Object.keys', () => {
			const obj = { foo: 1, bar: 2, baz: 3 };
			const typedKeys = getTypedKeys( obj );
			const objectKeys = Object.keys( obj );
			assert.deepStrictEqual( typedKeys, objectKeys );
		} );
	} );
} );

describe( 'areMapsEqual', () => {
	function basicComparator( one: unknown, two: unknown ): boolean {
		return one === two;
	}

	describe( 'basic equality checks', () => {
		it( 'should return true for two empty maps', () => {
			const map1 = new Map< string, number >();
			const map2 = new Map< string, number >();
			const result = areMapsEqual( map1, map2, basicComparator );
			assert.strictEqual( result, true );
		} );

		it( 'should return true for identical maps with primitive values', () => {
			const map1 = new Map< string, number >( [
				[ 'a', 1 ],
				[ 'b', 2 ],
				[ 'c', 3 ],
			] );
			const map2 = new Map< string, number >( [
				[ 'a', 1 ],
				[ 'b', 2 ],
				[ 'c', 3 ],
			] );
			const result = areMapsEqual( map1, map2, basicComparator );
			assert.strictEqual( result, true );
		} );

		it( 'should return true for maps with same entries in different insertion order', () => {
			const map1 = new Map< string, string >( [
				[ 'x', 'foo' ],
				[ 'y', 'bar' ],
			] );
			const map2 = new Map< string, string >( [
				[ 'y', 'bar' ],
				[ 'x', 'foo' ],
			] );
			const result = areMapsEqual( map1, map2, basicComparator );
			assert.strictEqual( result, true );
		} );
	} );

	describe( 'inequality checks', () => {
		it( 'should return false for maps with different sizes', () => {
			const map1 = new Map< string, number >( [
				[ 'a', 1 ],
				[ 'b', 2 ],
			] );
			const map2 = new Map< string, number >( [ [ 'a', 1 ] ] );
			const result = areMapsEqual( map1, map2, basicComparator );
			assert.strictEqual( result, false );
		} );

		it( 'should return false when map1 has a key not in map2', () => {
			const map1 = new Map< string, number >( [
				[ 'a', 1 ],
				[ 'b', 2 ],
			] );
			const map2 = new Map< string, number >( [
				[ 'a', 1 ],
				[ 'c', 2 ],
			] );
			const result = areMapsEqual( map1, map2, basicComparator );
			assert.strictEqual( result, false );
		} );

		it( 'should return false when values differ according to comparator', () => {
			const map1 = new Map< string, number >( [
				[ 'a', 1 ],
				[ 'b', 2 ],
			] );
			const map2 = new Map< string, number >( [
				[ 'a', 1 ],
				[ 'b', 3 ],
			] );
			const result = areMapsEqual( map1, map2, basicComparator );
			assert.strictEqual( result, false );
		} );

		it( 'should return false for empty vs non-empty map', () => {
			const map1 = new Map< string, number >();
			const map2 = new Map< string, number >( [ [ 'a', 1 ] ] );
			const result = areMapsEqual( map1, map2, basicComparator );
			assert.strictEqual( result, false );
		} );
	} );

	describe( 'custom comparator function', () => {
		interface Person {
			name: string;
			age: number;
		}

		function personComparator( person1: Person, person2: Person ): boolean {
			return person1.name === person2.name && person1.age === person2.age;
		}

		it( 'should use custom comparator for object values', () => {
			const map1 = new Map< string, Person >( [
				[ 'person1', { name: 'Alice', age: 30 } ],
				[ 'person2', { name: 'Bob', age: 25 } ],
			] );
			const map2 = new Map< string, Person >( [
				[ 'person1', { name: 'Alice', age: 30 } ],
				[ 'person2', { name: 'Bob', age: 25 } ],
			] );
			const result = areMapsEqual( map1, map2, personComparator );
			assert.strictEqual( result, true );
		} );

		it( 'should return false when custom comparator returns false', () => {
			const map1 = new Map< string, Person >( [ [ 'person1', { name: 'Alice', age: 30 } ] ] );
			const map2 = new Map< string, Person >( [ [ 'person1', { name: 'Alice', age: 31 } ] ] );
			const result = areMapsEqual( map1, map2, personComparator );
			assert.strictEqual( result, false );
		} );
	} );

	describe( 'edge cases', () => {
		it( 'should handle maps with number keys', () => {
			const map1 = new Map< number, string >( [
				[ 1, 'one' ],
				[ 2, 'two' ],
			] );
			const map2 = new Map< number, string >( [
				[ 1, 'one' ],
				[ 2, 'two' ],
			] );
			const result = areMapsEqual( map1, map2, basicComparator );
			assert.strictEqual( result, true );
		} );

		it( 'should handle maps with object keys', () => {
			const key1 = { id: 1 };
			const key2 = { id: 2 };
			const map1 = new Map< object, string >( [
				[ key1, 'value1' ],
				[ key2, 'value2' ],
			] );
			const map2 = new Map< object, string >( [
				[ key1, 'value1' ],
				[ key2, 'value2' ],
			] );
			const result = areMapsEqual( map1, map2, basicComparator );
			assert.strictEqual( result, true );
		} );

		it( 'should handle null values', () => {
			const map1 = new Map< string, string | null >( [
				[ 'a', 'value' ],
				[ 'b', null ],
			] );
			const map2 = new Map< string, string | null >( [
				[ 'a', 'value' ],
				[ 'b', null ],
			] );
			const result = areMapsEqual( map1, map2, basicComparator );
			assert.strictEqual( result, true );
		} );

		it( 'should handle undefined values', () => {
			const map1 = new Map< string, string | undefined >( [
				[ 'a', 'value' ],
				[ 'b', undefined ],
			] );
			const map2 = new Map< string, string | undefined >( [
				[ 'a', 'value' ],
				[ 'b', undefined ],
			] );
			const result = areMapsEqual( map1, map2, basicComparator );
			assert.strictEqual( result, true );
		} );
	} );
} );
