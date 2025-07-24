<?php declare(strict_types = 1);

namespace VIPRealtimeCollaboration\Tests\Traits;

use ReflectionClass;
use ReflectionException;
use ReflectionMethod;
use ReflectionProperty;

/**
 * Trait containing reflection utilities.
 */
trait ReflectionUtils {
	/**
	 * Gets a method from a class.
	 *
	 * Should be used when trying to access a private method for testing.
	 *
	 * @param string              $method_name Name of the method to get.
	 * @param class-string|object $class_name  Name of the class the method is in.
	 * @throws ReflectionException The method does not exist in the class.
	 */
	public static function get_method( string $method_name, string|object $class_name ): ReflectionMethod {
		$method = ( new ReflectionClass( $class_name ) )->getMethod( $method_name );
		$method->setAccessible( true );

		return $method;
	}

	/**
	 * Gets a property from a class.
	 *
	 * Should be used when trying to access a private property for testing.
	 *
	 * @param string              $property_name Name of the property to get.
	 * @param class-string|object $class_name  Name of the class the property is in.
	 * @throws ReflectionException The property does not exist in the class.
	 */
	public static function get_property( string $property_name, string|object $class_name ): ReflectionProperty {
		$property = ( new ReflectionClass( $class_name ) )->getProperty( $property_name );
		$property->setAccessible( true );

		return $property;
	}

	/**
	 * Overrides the value of a private property.
	 *
	 * Useful when mocking the internals of a class. The property will no longer
	 * be private after setAccessible() is called.
	 *
	 * @param object $obj The object instance on which to set the value.
	 * @param string $property_name The name of the private property to override.
	 * @param mixed  $value The value to set.
	 * @throws ReflectionException The property does not exist in the class.
	 */
	public static function set_private_property( object $obj, string $property_name, mixed $value ): void {
		$property = ( new ReflectionClass( $obj ) )->getProperty( $property_name );
		$property->setAccessible( true );
		$property->setValue( $obj, $value );
	}

	/**
	 * Overrides the value of a protected property.
	 *
	 * Useful when mocking the internals of a class. The property will no longer
	 * be protected after setAccessible() is called.
	 *
	 * @param object $obj The object instance on which to set the value.
	 * @param string $property_name The name of the protected property to override.
	 * @param mixed  $value The value to set.
	 * @throws ReflectionException The property does not exist in the class.
	 */
	public static function set_protected_property( object $obj, string $property_name, mixed $value ): void {
		$reflection = new ReflectionClass( $obj );
		$property = $reflection->getProperty( $property_name );
		$property->setAccessible( true );
		$property->setValue( $obj, $value );
	}
}
